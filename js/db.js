/* ชั้นข้อมูลชั้นเดียวของทั้งเกม
   ทุกการอ่าน/เขียนต้องผ่าน db.* เท่านั้น

   มีสองโหมด เลือกอัตโนมัติจาก CFG.fbUrl
   - ออนไลน์  : Firebase Realtime Database ผ่าน REST ล้วน ไม่ต้องโหลด SDK
                บัญชีและลีดเดอร์บอร์ดใช้ร่วมกันทุกเครื่อง
   - ออฟไลน์  : localStorage ของเครื่องนี้ ใช้เล่นโหมดรหัสห้องได้ แต่บอร์ดเป็นของเครื่องใครเครื่องมัน */
const db = (() => {
  const K = {
    players: "td_players", session: "td_session", matches: "td_matches",
    qstats: "td_qstats", season: "td_season"
  };

  const read  = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
  const write = (k, v)  => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn("เขียนข้อมูลไม่สำเร็จ", e); } };
  /* เก็บผู้เล่นแยกคีย์ละคน ไม่ใช่ก้อนเดียว
     ถ้าเก็บก้อนเดียว เปิดสองแท็บเล่นกันเองจะเกิด lost update ทับกันเอง */
  const nameList = () => read(K.players, []);
  const pKey = n => "td_p_" + n;
  const localPlayer = n => read(pKey(n), null);
  const localPlayers = () => Object.fromEntries(nameList().map(n => [n, localPlayer(n)]).filter(([, v]) => v));
  function localSave(p) {
    write(pKey(p.name), p);
    const list = nameList();
    if (!list.includes(p.name)) write(K.players, [...list, p.name]);
  }

  /* ---------- Firebase REST ---------- */
  const key = s => encodeURIComponent(String(s));
  async function fbReq(path, opt = {}) {
    const r = await fetch(`${CFG.fbUrl}/${path}.json`, opt);
    if (!r.ok) throw new Error("เซิร์ฟเวอร์ตอบ " + r.status + " — ตรวจ URL และกฎการเข้าถึงของ Realtime Database");
    return r.json();
  }
  const fbGet = p => fbReq(p);
  const fbPut = (p, v) => fbReq(p, { method: "PUT", body: JSON.stringify(v) });
  const fbPatch = (p, v) => fbReq(p, { method: "PATCH", body: JSON.stringify(v) });
  const fbPost = (p, v) => fbReq(p, { method: "POST", body: JSON.stringify(v) });
  const fbDel = p => fbReq(p, { method: "DELETE" });

  return {
    online: () => CFG.online,
    fb: { get: fbGet, put: fbPut, patch: fbPatch, post: fbPost, del: fbDel, key },

    /* ---- player ---- */
    async getPlayer(name) {
      if (CFG.online) return (await fbGet("players/" + key(name))) || null;
      return localPlayer(name);
    },
    async getPlayerById(id) {
      if (CFG.online) {
        const all = (await fbGet("players")) || {};
        return Object.values(all).find(p => p.id === id) || null;
      }
      return Object.values(localPlayers()).find(p => p.id === id) || null;
    },
    async savePlayer(p) {
      localSave(p);                              // เก็บสำเนาไว้เครื่องเสมอ กันเน็ตหลุด
      if (CFG.online) { try { await fbPut("players/" + key(p.name), p); } catch (e) { console.warn("ซิงก์ผู้เล่นไม่สำเร็จ", e); } }
      return p;
    },
    async allPlayers() {
      if (CFG.online) return Object.values((await fbGet("players")) || {});
      return Object.values(localPlayers());
    },

    /* ---- leaderboard ---- */
    async topPlayers(field = "mmr", limit = 100) {
      return (await this.allPlayers())
        .filter(p => (p.wins + p.losses) > 0)
        .sort((a, b) => (b[field] || 0) - (a[field] || 0))
        .slice(0, limit);
    },

    /* ---- session (อยู่ที่เครื่องเสมอ) ---- */
    getSession()   { const s = read(K.session, null); return (s && s.exp > Date.now()) ? s : null; },
    setSession(id) { write(K.session, { id, token: crypto.randomUUID(), exp: Date.now() + 30 * 86400000 }); },
    clearSession() { localStorage.removeItem(K.session); },

    /* ---- ประวัติแมตช์ (เก็บที่เครื่อง ประวัติเป็นเรื่องส่วนตัว) ---- */
    async saveMatch(m) {
      const list = read(K.matches, []);
      list.unshift(m);
      write(K.matches, list.slice(0, 300));
    },
    async matchesOf(playerId, limit = 20) {
      return read(K.matches, []).filter(m => m.players.includes(playerId)).slice(0, limit);
    },

    /* ---- สถิติคำถาม ---- */
    qstats()          { return read(K.qstats, {}); },
    saveQstats(stats) { write(K.qstats, stats); },

    /* ---- ซีซั่น ---- */
    season() {
      let s = read(K.season, null);
      if (!s || s.endsAt < Date.now()) {
        s = { no: (s ? s.no + 1 : 1), startedAt: Date.now(), endsAt: Date.now() + 30 * 86400000 };
        write(K.season, s);
      }
      return s;
    },

    wipeLocal() {
      nameList().forEach(n => localStorage.removeItem(pKey(n)));
      Object.values(K).forEach(k => localStorage.removeItem(k));
    }
  };
})();
