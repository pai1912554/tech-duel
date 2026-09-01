/* ชั้นเชื่อมต่อผู้เล่นสองคน — ทั้งเกมคุยกันผ่าน NET.send() / NET.on() เท่านั้น

   สองโหมด:
   - firebase : ต้องตั้งค่า databaseURL ก่อน ได้ทั้งจับคู่อัตโนมัติ ห้องส่วนตัว
                บัญชีข้ามเครื่อง และลีดเดอร์บอร์ดรวม (REST + EventSource ไม่ต้องโหลด SDK)
   - p2p      : ไม่ต้องตั้งค่าอะไรเลย ต่อตรงระหว่างเบราว์เซอร์ด้วย WebRTC ผ่าน PeerJS
                ใช้ได้เฉพาะห้องรหัส และบอร์ดยังเป็นของเครื่องใครเครื่องมัน

   ข้อความทุกชิ้นถึงทั้งสองฝั่งเสมอ รวมถึงคนส่งเอง ตรรกะเกมจึงเขียนแบบเดียวได้ทั้งสองโหมด */
const NET = (() => {
  const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const newCode = () => [...Array(4)].map(() => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");

  let mode = null;          // "firebase" | "p2p"
  let room = null;          // { code, isHost, me, opp }
  let handlers = [];
  let es = null;            // EventSource ของห้อง (firebase)
  let queueEs = null;       // EventSource ของคิวจับคู่ (firebase)
  let peer = null, conn = null;   // p2p
  let seen = new Set();
  let warm = null;                // Peer ที่อุ่นเครื่องไว้ล่วงหน้า
  let status = () => {};          // callback บอกสถานะระหว่างต่อ

  /* เซิร์ฟเวอร์ STUN ไว้หาเส้นทางกันเอง ยิ่งมีหลายตัวยิ่งมีโอกาสต่อติดเร็ว */
  const PEER_OPTS = {
    config: {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478" }
      ]
    }
  };

  const emit = (ev, data) => handlers.forEach(h => h(ev, data));
  const slim = p => ({ id: p.id, name: p.name, displayName: p.displayName, mmr: p.mmr, streak: p.streak });

  /* ================= PeerJS (โหลดตอนใช้จริงเท่านั้น) ================= */
  /* โหลดจากไฟล์ในเว็บเราเองก่อน (เร็วกว่าและไม่ตายถ้า CDN ถูกบล็อก) ค่อยถอยไป CDN */
  let peerJsLoading = null;
  function loadPeerJS() {
    if (window.Peer) return Promise.resolve();
    if (peerJsLoading) return peerJsLoading;
    const tryLoad = src => new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error("โหลดไม่สำเร็จ: " + src));
      document.head.appendChild(s);
    });
    peerJsLoading = tryLoad("js/vendor/peerjs.min.js")
      .catch(() => tryLoad("https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js"))
      .catch(() => { peerJsLoading = null; throw new Error("โหลดไลบรารี P2P ไม่สำเร็จ ต้องต่ออินเทอร์เน็ตก่อน"); });
    return peerJsLoading;
  }

  /* เปิด Peer ทิ้งไว้ตั้งแต่อยู่ห้องโถง ตอนกดปุ่มจริงจะได้ไม่ต้องรอขั้นตอนนี้อีก
     ขั้นขอ ID จากโบรกเกอร์คือขั้นที่ช้าที่สุด กินเวลาได้หลายวินาที */
  function prewarm() {
    if (CFG.online || warm || peer) return;
    loadPeerJS().then(() => {
      if (warm || peer) return;
      const p = new Peer(undefined, PEER_OPTS);
      p.on("open", () => { warm = p; });
      p.on("error", () => { try { p.destroy(); } catch {} });
    }).catch(() => {});
  }

  /* ขอ Peer ที่พร้อมใช้ — ถ้าอุ่นไว้แล้วได้ทันที */
  function openPeer(id) {
    return new Promise(async (res, rej) => {
      await loadPeerJS();
      if (!id && warm && warm.open) { const p = warm; warm = null; return res(p); }
      status(id ? "กำลังจองรหัสห้อง…" : "กำลังขอที่อยู่จากเซิร์ฟเวอร์…");
      const p = new Peer(id, PEER_OPTS);
      const timer = setTimeout(() => rej(new Error("เซิร์ฟเวอร์หาคู่ตอบช้าผิดปกติ ลองกดใหม่อีกครั้ง")), 20000);
      p.on("open", () => { clearTimeout(timer); res(p); });
      p.on("error", err => {
        clearTimeout(timer);
        rej(new Error(err.type === "unavailable-id"
          ? "รหัสห้องนี้ถูกใช้อยู่ ลองกดสร้างใหม่อีกครั้ง"
          : "ต่อ P2P ไม่สำเร็จ: " + err.type));
      });
    });
  }

  const peerId = code => "techduel-v1-" + code;

  function wireConn(c) {
    conn = c;
    c.on("data", m => { if (m && m.t) emit("msg", m); });
    c.on("close", () => emit("left", null));
    c.on("error", () => emit("left", null));
  }

  /* ================= Firebase ================= */
  function openRoomStream(code) {
    closeStream();
    es = new EventSource(`${CFG.fbUrl}/rooms/${code}.json`);
    es.addEventListener("put", e => {
      const { path, data } = JSON.parse(e.data);
      if (path === "/") {                       // สแนปช็อตแรกของห้อง
        if (!data) return emit("gone", null);
        if (data.guest) emit("peer", data.guest);
        if (data.host)  emit("host", data.host);
        Object.entries(data.msgs || {}).forEach(([k, m]) => { if (!seen.has(k)) { seen.add(k); emit("msg", m); } });
        return;
      }
      if (path === "/guest" && data) return emit("peer", data);
      const mm = path.match(/^\/msgs\/([^/]+)$/);
      if (mm && data && !seen.has(mm[1])) { seen.add(mm[1]); emit("msg", data); }
      if (path === "/left" && data) emit("left", data);
    });
    es.onerror = () => {/* EventSource ต่อใหม่เองอัตโนมัติ */};
  }

  function closeStream() { if (es) { es.close(); es = null; } }

  /* ================= API ================= */
  return {
    get mode()   { return mode; },
    get room()   { return room; },
    get inRoom() { return !!room; },
    newCode,

    prewarm,
    onStatus(fn) { status = fn || (() => {}); },
    on(fn)  { handlers.push(fn); },
    off(fn) { handlers = handlers.filter(h => h !== fn); },
    clear() { handlers = []; },

    /* ---- สร้างห้อง ---- */
    async createRoom(me, wantMode) {
      mode = wantMode;
      seen = new Set();
      const code = newCode();
      room = { code, isHost: true, me: slim(me), opp: null };

      if (mode === "firebase") {
        await db.fb.put(`rooms/${code}`, { host: slim(me), createdAt: Date.now(), private: true });
        openRoomStream(code);
      } else {
        peer = await openPeer(peerId(code));
        peer.on("connection", c => {
          wireConn(c);
          c.on("open", () => { c.send({ t: "hello", who: room.me }); });
        });
      }
      return code;
    },

    /* ---- เข้าห้องด้วยรหัส ---- */
    async joinRoom(me, code, wantMode) {
      mode = wantMode;
      seen = new Set();
      code = code.trim().toUpperCase();
      room = { code, isHost: false, me: slim(me), opp: null };

      if (mode === "firebase") {
        const r = await db.fb.get(`rooms/${code}`);
        if (!r) throw new Error("ไม่พบห้องรหัสนี้");
        if (r.guest && r.guest.id !== me.id) throw new Error("ห้องนี้เต็มแล้ว");
        room.opp = r.host;
        await db.fb.put(`rooms/${code}/guest`, slim(me));
        openRoomStream(code);
      } else {
        peer = await openPeer();
        status("กำลังต่อกับเจ้าของห้อง…");
        await new Promise((res, rej) => {
          const c = peer.connect(peerId(code), { reliable: true });
          const timer = setTimeout(() => rej(new Error("ต่อกับห้อง " + code + " ไม่ได้ — เช็กว่าเจ้าของห้องยังเปิดหน้าเว็บค้างอยู่ และพิมพ์รหัสถูก")), 15000);
          c.on("open", () => { clearTimeout(timer); wireConn(c); c.send({ t: "hello", who: room.me }); res(); });
          c.on("error", () => { clearTimeout(timer); rej(new Error("เข้าห้องไม่สำเร็จ")); });
        });
      }
      return code;
    },

    /* ---- จับคู่อัตโนมัติ (Firebase เท่านั้น) ---- */
    async quickMatch(me, onWaiting) {
      mode = "firebase";
      seen = new Set();
      const now = Date.now();
      const q = (await db.fb.get("queue")) || {};
      const cand = Object.entries(q)
        .map(([k, v]) => ({ k, ...v }))
        .filter(v => v.id !== me.id && now - (v.ts || 0) < 45000)
        .sort((a, b) => Math.abs(a.mmr - me.mmr) - Math.abs(b.mmr - me.mmr))[0];

      if (cand) {                                   // เจอคนรอ — เก็บเข้าห้องแล้วส่งคำเชิญ
        await db.fb.del(`queue/${cand.k}`);
        const code = newCode();
        room = { code, isHost: true, me: slim(me), opp: null };
        await db.fb.put(`rooms/${code}`, { host: slim(me), createdAt: Date.now() });
        await db.fb.put(`invites/${db.fb.key(cand.id)}`, { code, ts: Date.now() });
        openRoomStream(code);
        return { code, waiting: false };
      }

      // ไม่เจอใคร — เข้าคิวแล้วรอคำเชิญ
      const myKey = db.fb.key(me.id);
      await db.fb.put(`queue/${myKey}`, { id: me.id, name: me.displayName, mmr: me.mmr, ts: Date.now() });
      onWaiting && onWaiting();
      return new Promise((resolve, reject) => {
        queueEs = new EventSource(`${CFG.fbUrl}/invites/${myKey}.json`);
        queueEs.addEventListener("put", async e => {
          const { data } = JSON.parse(e.data);
          if (!data || !data.code) return;
          queueEs.close(); queueEs = null;
          try {
            await db.fb.del(`queue/${myKey}`);
            await db.fb.del(`invites/${myKey}`);
            await NET.joinRoom(me, data.code, "firebase");
            resolve({ code: data.code, waiting: false });
          } catch (err) { reject(err); }
        });
        queueEs.onerror = () => {};
      });
    },

    async cancelQueue(me) {
      if (queueEs) { queueEs.close(); queueEs = null; }
      if (CFG.online) { try { await db.fb.del(`queue/${db.fb.key(me.id)}`); } catch {} }
    },

    /* ---- ส่งข้อความถึงทั้งสองฝั่ง ---- */
    async send(msg) {
      if (!room) return;
      const m = { ...msg, from: room.me.id, at: Date.now() };
      if (mode === "firebase") {
        try { await db.fb.post(`rooms/${room.code}/msgs`, m); } catch (e) { console.warn("ส่งข้อความไม่สำเร็จ", e); }
      } else {
        emit("msg", m);                        // ฝั่งเราเห็นเอง
        if (conn && conn.open) conn.send(m);   // อีกฝั่งเห็นผ่านสาย
      }
    },

    /* ---- ออกจากห้อง ---- */
    async leave(silent = false) {
      const r = room;
      room = null;
      closeStream();
      if (queueEs) { queueEs.close(); queueEs = null; }
      if (!r) { handlers = []; return; }
      if (mode === "firebase") {
        try {
          if (!silent) await db.fb.put(`rooms/${r.code}/left`, r.me.id);
          if (r.isHost) setTimeout(() => db.fb.del(`rooms/${r.code}`).catch(() => {}), 1500);
        } catch {}
      } else {
        try { if (conn && conn.open && !silent) conn.send({ t: "bye", from: r.me.id }); } catch {}
        try { conn && conn.close(); } catch {}
        try { peer && peer.destroy(); } catch {}
        conn = peer = null;
        setTimeout(prewarm, 500);          // อุ่นเครื่องรอบใหม่ไว้เลย
      }
      handlers = [];
    }
  };
})();
