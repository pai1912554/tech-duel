/* ---------- helper DOM ---------- */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmtMs = ms => (ms / 1000).toFixed(1) + " วิ";
const qById = id => QUESTION_BANK.find(q => q.id === id);

const app = $("#app");
let ME = null;    // ผู้เล่นปัจจุบัน
let M  = null;    // แมตช์ที่กำลังเล่น (null = ไม่ได้อยู่ในแมตช์)

/* ================= หน้าจอ: ล็อกอิน ================= */
function screenLogin(msg) {
  M = null;
  app.innerHTML = `
    <div class="center-wrap">
      <div class="brand">
        <div class="brand-badge">TD</div>
        <h1>Tech Duel</h1>
        <p class="sub">ดวลความรู้เทคโนโลยี 1v1 · 10 ข้อ ข้อละ 30 วิ · ไต่แรงค์ Bronze → Master</p>
      </div>
      <form class="card login-card" id="loginForm" autocomplete="off">
        <label>ชื่อผู้เล่น
          <input id="inName" maxlength="12" placeholder="3–12 ตัว a-z 0-9 _ หรือไทย" required>
        </label>
        <label>รหัส 6 ตัว
          <input id="inPin" inputmode="numeric" maxlength="6" placeholder="ตัวเลข 6 หลัก" required>
        </label>
        <div class="err" id="loginErr">${msg ? esc(msg) : ""}</div>
        <button class="btn primary big" type="submit">เข้าสู่ระบบ / สมัครอัตโนมัติ</button>
        <p class="hint">ยังไม่มีชื่อนี้ ระบบจะสมัครให้ทันที · ห้ามเลขซ้ำล้วนและเลขเรียง</p>
        <div class="mode-note ${CFG.online ? "on" : ""}">
          ${CFG.online
            ? `🌐 โหมดออนไลน์ — บัญชีและลีดเดอร์บอร์ดใช้ร่วมกันทุกเครื่อง`
            : `📴 ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ — บัญชีอยู่เฉพาะเครื่องนี้ เล่นกับเพื่อนได้ด้วยรหัสห้อง`}
          <button type="button" class="btn ghost sm" id="btnSetup">ตั้งค่าเซิร์ฟเวอร์</button>
        </div>
        ${storageWorks() ? "" : `<p class="warn">⚠ เบราว์เซอร์นี้เก็บข้อมูลไม่ได้ (โหมดส่วนตัว หรือปิดการเก็บข้อมูลเว็บไว้)
        เกมจะเล่นได้แต่จำบัญชีไม่ได้ ลองเปิดในโหมดปกติ</p>`}
        <p class="warn">⚠ รหัส 6 หลักมีความเป็นไปได้แค่ 1 ล้านแบบ และข้อมูลไม่ได้เข้ารหัสระดับใช้งานจริง
        — <b>อย่าใช้รหัสเดียวกับบัญชีอื่น</b></p>
        <details class="howto"><summary>เข้าไม่ได้? กดดูผลตรวจเครื่อง</summary>
          <div id="diag" class="diag"></div>
        </details>
      </form>
    </div>`;

  $("#btnSetup").onclick = () => screenSetup(() => screenLogin());
  renderDiag();
  $("#loginForm").onsubmit = async e => {
    e.preventDefault();
    const btn = $("#loginForm button[type=submit]");
    btn.disabled = true;
    try {
      const { player, created } = await login($("#inName").value, $("#inPin").value);
      ME = player;
      screenLobby(created ? "สมัครสำเร็จ ยินดีต้อนรับ " + esc(player.displayName) : null);
    } catch (err) {
      $("#loginErr").textContent = err.message;
      btn.disabled = false;
    }
  };
}

/* ผลตรวจความเข้ากันได้ของเบราว์เซอร์ — ให้ผู้เล่นแคปหน้าจอส่งมาได้เวลาเข้าไม่ได้ */
function renderDiag() {
  const box = $("#diag");
  if (!box) return;
  const ok = v => v ? '<b class="y">ผ่าน</b>' : '<b class="n">ไม่ผ่าน</b>';
  let hasUUID = false, hasRnd = false;
  try { hasUUID = typeof crypto?.randomUUID === "function"; } catch {}
  try { hasRnd = typeof crypto?.getRandomValues === "function"; } catch {}
  box.innerHTML = `
    <div>หน้าเว็บปลอดภัย (HTTPS): ${ok(window.isSecureContext)}</div>
    <div>เก็บข้อมูลในเครื่อง: ${ok(storageWorks())}</div>
    <div>เข้ารหัสรหัสผ่าน (SHA-256): ${ok(!!(window.crypto && crypto.subtle))}</div>
    <div>สุ่มค่าแบบมาตรฐาน: ${ok(hasUUID)} / สำรอง: ${ok(hasRnd)}</div>
    <div>ต่อ P2P (WebRTC): ${ok(typeof RTCPeerConnection === "function")}</div>
    <div class="ua">${esc(navigator.userAgent)}</div>`;
}

/* กัน "จอขาว" — error ที่หลุดออกมาต้องเห็นบนจอ ไม่ใช่ซ่อนอยู่ใน console ที่มือถือเปิดดูไม่ได้ */
window.addEventListener("error", e => {
  const box = $("#loginErr") || $(".err");
  if (box) box.textContent = "เกิดข้อผิดพลาด: " + (e.message || e.error);
});
window.addEventListener("unhandledrejection", e => {
  const box = $("#loginErr") || $(".err");
  if (box) box.textContent = "เกิดข้อผิดพลาด: " + (e.reason?.message || e.reason);
});

/* ================= หน้าจอ: ตั้งค่าเซิร์ฟเวอร์ ================= */
function screenSetup(back) {
  app.innerHTML = `
    <div class="center-wrap">
      <div class="card">
        <h2>ตั้งค่าเซิร์ฟเวอร์</h2>
        <p class="hint">ใส่ <b>databaseURL</b> ของ Firebase Realtime Database เพื่อเปิดโหมดออนไลน์:
        จับคู่อัตโนมัติ ลีดเดอร์บอร์ดรวมทุกคน และบัญชีที่ใช้ได้ทุกเครื่อง<br>
        ปล่อยว่างไว้ก็เล่นกับเพื่อนด้วยรหัสห้องได้ (P2P) แต่บอร์ดจะแยกตามเครื่อง</p>
        <label class="lbl">databaseURL
          <input id="fbUrl" placeholder="https://ชื่อโปรเจกต์-default-rtdb.asia-southeast1.firebasedatabase.app"
                 value="${esc(CFG.fbUrl)}">
        </label>
        <div class="err" id="setupErr"></div>
        <div class="res-btns">
          <button class="btn primary" id="saveFb">บันทึกและทดสอบ</button>
          <button class="btn ghost" id="clearFb">ล้างค่า (เล่นออฟไลน์)</button>
        </div>
        <details class="howto">
          <summary>วิธีสร้างฟรีใน 4 ขั้น</summary>
          <ol>
            <li>เข้า <b>console.firebase.google.com</b> → Add project (ฟรี ไม่ต้องผูกบัตร)</li>
            <li>เมนู Build → <b>Realtime Database</b> → Create Database → เลือก region → Start in <b>test mode</b></li>
            <li>คัดลอก URL ที่ขึ้นบนหัวตาราง (ลงท้าย <code>firebasedatabase.app</code>) มาวางช่องข้างบน</li>
            <li>กดบันทึก แล้วบอก URL เดียวกันนี้กับเพื่อนที่จะเล่นด้วยกัน</li>
          </ol>
          <p class="warn">test mode = ใครมี URL ก็อ่านเขียนได้ทั้งหมด เหมาะกับเกมเล่นกันเองเท่านั้น
          ห้ามเอาฐานข้อมูลนี้ไปเก็บข้อมูลจริงของใคร และควรตั้งวันหมดอายุของกฎไว้</p>
        </details>
        <button class="btn ghost big" id="backBtn">ย้อนกลับ</button>
      </div>
    </div>`;

  $("#backBtn").onclick = back;
  $("#clearFb").onclick = () => { CFG.fbUrl = ""; back(); };
  $("#saveFb").onclick = async () => {
    const v = $("#fbUrl").value.trim();
    if (!v) { CFG.fbUrl = ""; return back(); }
    $("#setupErr").textContent = "กำลังทดสอบ…";
    const old = CFG.fbUrl;
    CFG.fbUrl = v;
    try {
      await db.fb.put("ping", Date.now());
      $("#setupErr").textContent = "";
      back();
    } catch (e) {
      CFG.fbUrl = old;
      $("#setupErr").textContent = e.message;
    }
  };
}

/* ================= topbar ================= */
function topbar(active) {
  const r = rankOf(ME.mmr);
  return `
  <header class="topbar ${ME.streak >= 5 ? "hot" : ""}">
    <div class="who">
      <span class="rank-chip" style="--tc:${TIERS[r.tier].color}">
        ${isPlacing(ME) ? "จัดอันดับ " + (ME.wins + ME.losses) + "/5" : rankLabel(ME.mmr)}
      </span>
      <b>${esc(ME.displayName)}</b>
      <span class="streak-chip ${ME.streak >= 3 ? "on" : ""}">🔥 ${ME.streak}${ME.streakShield ? " 🛡" : ""}</span>
      <span class="net-chip ${CFG.online ? "on" : ""}">${CFG.online ? "🌐 ออนไลน์" : "📴 ออฟไลน์"}</span>
    </div>
    <nav>
      <button class="tab ${active === "lobby" ? "sel" : ""}" data-go="lobby">ห้องโถง</button>
      <button class="tab ${active === "board" ? "sel" : ""}" data-go="board">บอร์ด</button>
      <button class="tab ${active === "profile" ? "sel" : ""}" data-go="profile">โปรไฟล์</button>
      <button class="tab" data-go="logout">ออก</button>
    </nav>
  </header>`;
}

function bindNav() {
  $$("[data-go]").forEach(b => b.onclick = async () => {
    const go = b.dataset.go;
    if (M || NET.inRoom) await quitMatch(true);
    if (go === "lobby") screenLobby();
    if (go === "board") screenBoard();
    if (go === "profile") screenProfile();
    if (go === "logout") { db.clearSession(); ME = null; screenLogin(); }
  });
}

/* ================= หน้าจอ: ห้องโถง ================= */
function screenLobby(flash) {
  M = null;
  const lad = ladderOf(ME.streak);
  const nextStep = STREAK_LADDER.find(s => s.at > ME.streak);
  const season = db.season();
  const days = Math.ceil((season.endsAt - Date.now()) / 86400000);

  app.innerHTML = topbar("lobby") + `
    <main class="wrap ${ME.streak >= 5 ? "hot-bg" : ""}">
      ${flash ? `<div class="flash">${flash}</div>` : ""}
      <section class="card hero">
        <div class="hero-left">
          <div class="big-rank" style="--tc:${TIERS[rankOf(ME.mmr).tier].color}">
            <div class="rk-label">${isPlacing(ME) ? "จัดอันดับ" : rankLabel(ME.mmr)}</div>
            <div class="rk-mmr">${isPlacing(ME) ? (ME.wins + ME.losses) + " / 5 แมตช์" : ME.mmr + " MMR"}</div>
          </div>
          <div class="season">ซีซั่น ${season.no} · เหลือ ${days} วัน</div>
        </div>
        <div class="hero-right">
          <div class="streak-box ${ME.streak >= 3 ? "on" : ""}">
            <div class="s-num">🔥 ${ME.streak}</div>
            <div class="s-lab">${lad ? lad.label + " · " + lad.note : "ชนะเพื่อเริ่มนับสตรีค"}</div>
            <div class="s-bar"><i style="width:${nextStep ? Math.min(100, ME.streak / nextStep.at * 100) : 100}%"></i></div>
            <div class="s-next">${nextStep ? `อีก ${nextStep.at - ME.streak} ชนะ → ${nextStep.label} (${nextStep.note})` : "สูงสุดแล้ว"}</div>
            <div class="s-meta">สถิติสูงสุด ${ME.bestStreak} · โล่สตรีค ${ME.streakShield} · โล่แรงค์ ${ME.shield} · เข้าเล่นต่อเนื่อง ${ME.dailyStreak} วัน</div>
          </div>

          <button class="btn primary big" id="btnQuick" ${CFG.online ? "" : "disabled"}>
            จับคู่อัตโนมัติ · ดวล 10 ข้อ ${CFG.online ? "" : "(ต้องตั้งค่าเซิร์ฟเวอร์)"}
          </button>
          <div class="row2">
            <button class="btn" id="btnCreate">สร้างห้องชวนเพื่อน</button>
            <button class="btn" id="btnJoin">เข้าห้องด้วยรหัส</button>
          </div>
          ${CFG.online ? "" : `<p class="hint">โหมดออฟไลน์เล่นได้เฉพาะห้องรหัส (ต่อตรงระหว่างเบราว์เซอร์)
            <button class="btn ghost sm" id="btnSetup2">ตั้งค่าเซิร์ฟเวอร์</button></p>`}
        </div>
      </section>

      <section class="grid3">
        <div class="card mini"><div class="k">ชนะ / แพ้</div><div class="v">${ME.wins} / ${ME.losses}</div></div>
        <div class="card mini"><div class="k">อัตราชนะ</div><div class="v">${winRate(ME)}%</div></div>
        <div class="card mini"><div class="k">เวลาตอบเฉลี่ย</div><div class="v">${avgMs(ME)}</div></div>
      </section>

      <section class="card">
        <h3>บันไดสตรีค</h3>
        <div class="ladder">
          ${STREAK_LADDER.map(s => `
            <div class="lad ${ME.streak >= s.at ? "got" : ""}">
              <span class="lad-at">${s.at}</span><span class="lad-l">${s.label}</span><span class="lad-n">${s.note}</span>
            </div>`).join("")}
        </div>
        <p class="hint">ดวล 10 ข้อ ข้อละ 30 วินาที · ตัวเลือกสลับตำแหน่งทุกข้อ ·
        เสมอเมื่อไหร่ต่อ Sudden Death จนกว่าจะมีคนชนะ · แพ้แล้วชนะภายใน 10 นาที = กู้สตรีคคืนครึ่งหนึ่ง</p>
      </section>
    </main>`;
  bindNav();
  $("#btnQuick").onclick = quickMatch;
  $("#btnCreate").onclick = createRoom;
  $("#btnJoin").onclick = joinRoomPrompt;
  if ($("#btnSetup2")) $("#btnSetup2").onclick = () => screenSetup(() => screenLobby());
}

const winRate = p => (p.wins + p.losses) ? Math.round(p.wins / (p.wins + p.losses) * 100) : 0;
const avgMs   = p => p.totalAnswers ? (p.totalAnswerMs / p.totalAnswers / 1000).toFixed(1) + " วิ" : "—";
const transport = () => CFG.online ? "firebase" : "p2p";

/* ================= หา/สร้างห้อง ================= */
function screenWaiting({ title, code, note, onCancel }) {
  app.innerHTML = topbar("lobby") + `
    <main class="wrap">
      <section class="card vs-card">
        <div class="finding">${title}</div>
        ${code ? `
          <div class="roomcode">
            <span>รหัสห้อง</span>
            <b id="codeTxt">${code}</b>
            <button class="btn sm" id="copyCode">คัดลอก</button>
          </div>` : ""}
        <p class="hint">${note}</p>
        <button class="btn ghost" id="cancelWait">ยกเลิก</button>
      </section>
    </main>`;
  bindNav();
  $("#cancelWait").onclick = onCancel;
  if (code) $("#copyCode").onclick = async () => {
    try { await navigator.clipboard.writeText(code); $("#copyCode").textContent = "คัดลอกแล้ว"; }
    catch { $("#copyCode").textContent = "คัดลอกเองนะ"; }
  };
}

async function quickMatch() {
  try {
    screenWaiting({
      title: "กำลังหาคู่แข่ง…", note: "จะจับคู่กับคนที่ MMR ใกล้กันที่สุดที่กำลังรออยู่",
      onCancel: async () => { await NET.cancelQueue(ME); await NET.leave(true); screenLobby(); }
    });
    armMatch();
    await NET.quickMatch(ME, () => {
      const f = $(".finding");
      if (f) f.textContent = "อยู่ในคิวแล้ว รอคู่แข่ง…";
    });
    if (!NET.room) return;
    if (NET.room.isHost) waitForPeer("รอคู่แข่งเข้าห้อง…");
    else onPeerReady(NET.room.opp);
  } catch (e) {
    NET.clear(); await NET.leave(true);
    screenLobby(`<b>จับคู่ไม่สำเร็จ:</b> ${esc(e.message)}`);
  }
}

async function createRoom() {
  try {
    screenWaiting({ title: "กำลังสร้างห้อง…", note: "รอสักครู่", onCancel: async () => { await quitMatch(true); screenLobby(); } });
    armMatch();
    const code = await NET.createRoom(ME, transport());
    waitForPeer("รอเพื่อนเข้าห้อง…", code);
  } catch (e) {
    NET.clear(); await NET.leave(true);
    screenLobby(`<b>สร้างห้องไม่สำเร็จ:</b> ${esc(e.message)}`);
  }
}

function joinRoomPrompt() {
  app.innerHTML = topbar("lobby") + `
    <main class="wrap">
      <section class="card vs-card">
        <h3>เข้าห้องด้วยรหัส</h3>
        <input id="joinCode" class="codeinput" maxlength="4" placeholder="ABCD" autocapitalize="characters">
        <div class="err" id="joinErr"></div>
        <div class="res-btns">
          <button class="btn primary" id="doJoin">เข้าห้อง</button>
          <button class="btn ghost" data-go="lobby">ยกเลิก</button>
        </div>
        <p class="hint">ต้องอยู่โหมดเดียวกับเจ้าของห้อง
        (${CFG.online ? "ออนไลน์ — ต้องใช้ databaseURL เดียวกัน" : "ออฟไลน์ P2P — ต่อตรงระหว่างเบราว์เซอร์"})</p>
      </section>
    </main>`;
  bindNav();
  $("#joinCode").focus();
  $("#doJoin").onclick = async () => {
    const code = $("#joinCode").value.trim().toUpperCase();
    if (code.length !== 4) return $("#joinErr").textContent = "รหัสห้องมี 4 ตัว";
    $("#doJoin").disabled = true;
    try {
      screenWaiting({ title: "กำลังเข้าห้อง…", note: "รอสักครู่", onCancel: async () => { await quitMatch(true); screenLobby(); } });
      armMatch();
      await NET.joinRoom(ME, code, transport());
      onPeerReady(NET.room.opp);          // ฝั่งเข้าห้องรู้จักเจ้าของห้องอยู่แล้ว
    } catch (e) {
      NET.clear(); await NET.leave(true);
      screenLobby(`<b>เข้าห้องไม่สำเร็จ:</b> ${esc(e.message)}`);
    }
  };
}

function waitForPeer(title, code) {
  screenWaiting({
    title, code: code || NET.room?.code,
    note: CFG.online ? "ส่งรหัสนี้ให้เพื่อน แล้วให้กด “เข้าห้องด้วยรหัส”"
                     : "ส่งรหัสนี้ให้เพื่อน · โหมด P2P ต้องเปิดหน้าเว็บนี้ค้างไว้ทั้งคู่",
    onCancel: async () => { await quitMatch(true); screenLobby(); }
  });
}

/* ================= ลูปแมตช์ผ่านเน็ต ================= */
function armMatch() {
  NET.clear();
  NET.on(onNetEvent);
}

function onNetEvent(ev, data) {
  if (ev === "peer" && data && data.id !== ME.id) return onPeerReady(data);
  if (ev === "host" && data && data.id !== ME.id && M) M.opp = M.opp || data;
  if (ev === "left" || ev === "gone") return opponentLeft();
  if (ev !== "msg" || !data) return;

  const m = data;
  if (m.t === "hello" && m.who && m.who.id !== ME.id) return onPeerReady(m.who);
  if (m.t === "bye" && m.from !== ME.id) return opponentLeft();
  if (!M) return;
  if (m.t === "q")      return onQuestion(m);
  if (m.t === "reveal") return onRevealOnly(m);
  if (m.t === "a")   return onAnswer(m);
  if (m.t === "res") return onResult(m);
}

function onPeerReady(opp) {
  if (!opp || (M && M.opp && M.opp.id === opp.id && M.started)) return;
  M = M || { rounds: [], scores: {}, no: 0, started: false, answers: {} };
  M.opp = opp;
  M.code = NET.room?.code;
  M.isHost = !!NET.room?.isHost;
  M.scores[ME.id] = M.scores[ME.id] || 0;
  M.scores[opp.id] = M.scores[opp.id] || 0;
  if (M.started) return;
  M.started = true;
  showVersus(opp);
}

async function showVersus(opp) {
  app.innerHTML = topbar("lobby") + `
    <main class="wrap">
      <section class="card vs-card">
        <div class="vs">
          <div class="vs-side">
            <div class="av me">${esc((ME.displayName || "?")[0])}</div>
            <b>${esc(ME.displayName)}</b>
            <span>${isPlacing(ME) ? "ยังจัดอันดับ" : rankLabel(ME.mmr)}</span>
            <span class="sk">🔥 ${ME.streak}</span>
          </div>
          <div class="vs-mid">VS</div>
          <div class="vs-side">
            <div class="av opp">${esc((opp.displayName || "?")[0])}</div>
            <b>${esc(opp.displayName)}</b>
            <span>${rankLabel(opp.mmr)}</span>
            <span class="sk">🔥 ${opp.streak || 0}</span>
          </div>
        </div>
        ${(opp.streak || 0) >= 15 ? `<div class="bounty">⚠ ผู้เล่นนี้ชนะติดกัน ${opp.streak} แมตช์ — ล้มได้ MMR +40%</div>` : ""}
        <div class="cd" id="cd">3</div>
      </section>`;
  bindNav();
  for (const n of ["3", "2", "1", "เริ่ม!"]) {
    if (!M) return;
    const c = $("#cd"); if (!c) return;
    c.textContent = n;
    c.animate([{ transform: "scale(1.6)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], 300);
    await sleep(650);
  }
  if (M && M.isHost) {
    M.queue = pickQuestions(ME, QUESTIONS_PER_MATCH + SUDDEN_DEATH_MAX);
    nextQuestion();
  }
}

/* เจ้าของห้องเลือกทั้งชุดตั้งแต่ต้นแมตช์ กันโจทย์ซ้ำ แล้วส่งทีละข้อพร้อมลำดับตัวเลือก
   อีกฝั่งเปิดโจทย์จากคลังในเครื่องตัวเองด้วย id เดียวกัน จึงเห็นตรงกันเป๊ะ */
function nextQuestion() {
  const used = new Set(M.rounds.map(r => r.qid));
  const q = (M.queue || []).find(x => !used.has(x.id))
         || QUESTION_BANK.find(x => !used.has(x.id))
         || QUESTION_BANK[0];
  NET.send({ t: "q", qid: q.id, no: M.no + 1, order: newChoiceOrder() });
}

function onQuestion(m) {
  const q = qById(m.qid);
  if (!q) return;
  M.no = m.no;
  M.answers = {};
  M.current = { qid: q.id, t0: performance.now(), answered: false, order: m.order || [0, 1, 2, 3] };
  renderQuestion(q, m.no, M.current.order);

  clearTimeout(M.hostTimer);
  if (M.isHost) {   // กันคู่แข่งหายกลางคัน
    M.hostTimer = setTimeout(() => {
      if (M && M.current && Object.keys(M.answers).length < 2) hostFinish(true);
    }, LIMIT_MS + 7000);
  }
}

function renderQuestion(q, no, order) {
  const sudden = no > QUESTIONS_PER_MATCH;
  app.innerHTML = topbar("lobby") + `
    <main class="wrap">
      <section class="card q-card">
        <div class="q-head">
          <span class="q-no">${sudden ? "SUDDEN DEATH #" + (no - QUESTIONS_PER_MATCH) : `ข้อ ${no} / ${QUESTIONS_PER_MATCH}`}</span>
          <span class="q-cat" style="--tc:${CATEGORIES[q.category].color}">
            ${CATEGORIES[q.category].icon} ${CATEGORIES[q.category].label} · ระดับ ${effectiveDifficulty(q)}
          </span>
          <span class="q-score">${M.scores[ME.id]} : ${M.scores[M.opp.id]}</span>
        </div>
        <div class="timebar"><i id="tb"></i></div>
        <div class="oppstate" id="oppState">คู่แข่งกำลังคิด…</div>
        <h2 class="q-text">${esc(q.text)}</h2>
        <div class="choices" id="choices">
          ${order.map(orig => `<button class="choice" data-i="${orig}">${esc(q.choices[orig])}</button>`).join("")}
        </div>
      </section>
    </main>`;
  bindNav();
  $$("#choices .choice").forEach(b => b.onclick = () => submitAnswer(q, +b.dataset.i));

  clearInterval(M.tick);
  M.tick = setInterval(() => {
    if (!M || !M.current) return clearInterval(M.tick);
    const left = Math.max(0, LIMIT_MS - (performance.now() - M.current.t0));
    const tb = $("#tb");
    if (tb) { tb.style.width = (left / LIMIT_MS * 100) + "%"; tb.classList.toggle("danger", left < 3000); }
    if (left <= 0) submitAnswer(q, null);
  }, 60);
}

async function submitAnswer(q, pick) {
  if (!M || !M.current || M.current.answered) return;
  M.current.answered = true;
  clearInterval(M.tick);
  const ms = Math.min(LIMIT_MS, Math.round(performance.now() - M.current.t0));
  const correct = pick === q.answer;

  $$("#choices .choice").forEach(b => { b.disabled = true; if (+b.dataset.i === pick) b.classList.add("picked"); });
  const st = $("#oppState");
  if (st && !st.classList.contains("done")) st.textContent = "ส่งคำตอบแล้ว รอคู่แข่ง…";

  // สถิติของเราและของคลังคำถาม
  ME.totalAnswers++; ME.totalAnswerMs += ms;
  const bc = (ME.byCategory[q.category] ||= { c: 0, w: 0 });
  correct ? bc.c++ : bc.w++;
  ME.recentIds = [q.id, ...(ME.recentIds || [])].slice(0, 50);
  recordAnswer(q, correct, ms, ME.mmr);
  await db.savePlayer(ME);

  NET.send({ t: "a", qid: q.id, ms, correct, pick });
}

function onAnswer(m) {
  if (!M || !M.current || m.qid !== M.current.qid) return;
  M.answers[m.from] = { ms: m.ms, correct: m.correct, pick: m.pick };
  if (m.from !== ME.id) {
    const st = $("#oppState");
    if (st) { st.textContent = "คู่แข่งตอบแล้ว"; st.classList.add("done"); }
  }
  if (M.isHost && M.answers[ME.id] && M.answers[M.opp.id]) hostFinish(false);
}

/* เจ้าของห้องเป็นคนคิดคะแนนและตัดสิน แล้วส่งผลให้ทั้งคู่เห็นตรงกัน */
function hostFinish(timeout) {
  clearTimeout(M.hostTimer);
  const myId = ME.id, oppId = M.opp.id;
  const blank = { ms: LIMIT_MS, correct: false, pick: null };
  const a = M.answers[myId] || blank;
  const b = M.answers[oppId] || blank;

  const aFirst = a.ms <= b.ms;
  const aPts = roundPoints(a.correct, a.ms, a.correct && aFirst);
  const bPts = roundPoints(b.correct, b.ms, b.correct && !aFirst);
  M.scores[myId] += aPts;
  M.scores[oppId] += bPts;
  M.rounds.push({ qid: M.current.qid, [myId]: { ...a, points: aPts }, [oppId]: { ...b, points: bPts } });

  const tie = M.scores[myId] === M.scores[oppId];
  const lastRound = M.no >= QUESTIONS_PER_MATCH;
  const sdLeft = M.no < QUESTIONS_PER_MATCH + SUDDEN_DEATH_MAX;

  if (timeout && !M.answers[oppId]) {          // คู่แข่งหาย = เราชนะ
    return NET.send({ t: "res", rounds: M.rounds, scores: M.scores, winner: myId, reason: "opponent-timeout" });
  }
  if (!lastRound || (tie && sdLeft)) {         // ยังไม่ครบ 10 ข้อ หรือครบแล้วแต่ยังเสมอ
    NET.send({ t: "reveal", rounds: M.rounds, scores: M.scores });
    return setTimeout(() => M && nextQuestion(), 2400);
  }
  let winner;
  if (!tie) winner = M.scores[myId] > M.scores[oppId] ? myId : oppId;
  else {                                        // เสมอสนิทหลัง SD ครบ — ตัดสินด้วยข้อถูกแล้วเวลารวม
    const cnt = id => M.rounds.filter(r => r[id].correct).length;
    const tot = id => M.rounds.reduce((s, r) => s + r[id].ms, 0);
    winner = cnt(myId) !== cnt(oppId) ? (cnt(myId) > cnt(oppId) ? myId : oppId)
                                      : (tot(myId) <= tot(oppId) ? myId : oppId);
  }
  NET.send({ t: "res", rounds: M.rounds, scores: M.scores, winner });
}

async function onResult(m) {
  if (!M) return;
  M.resultReceived = true;      // ผลตัดสินมาแล้ว ห้ามให้ event "คู่แข่งออกห้อง" มาทับทีหลัง
  clearInterval(M.tick); clearTimeout(M.hostTimer);
  M.rounds = m.rounds; M.scores = m.scores;
  await showReveal(m.rounds[m.rounds.length - 1]);
  finishMatch(m.winner === ME.id, m.reason);
}

/* เสมอ: โชว์เฉลยของข้อนี้ก่อน แล้วเจ้าของห้องจะส่งข้อ Sudden Death มาต่อเอง */
function onRevealOnly(m) {
  clearInterval(M.tick);
  M.rounds = m.rounds; M.scores = m.scores;
  showReveal(m.rounds[m.rounds.length - 1]);
}

function showReveal(round) {
  return new Promise(async resolve => {
    if (!round) return resolve();
    const q = qById(round.qid);
    const mine = round[ME.id], theirs = round[M.opp.id];
    $$("#choices .choice").forEach(b => {
      const i = +b.dataset.i;
      b.disabled = true;
      if (i === q.answer) b.classList.add("right");
      else if (i === mine.pick) b.classList.add("wrong");
    });
    const tb = $("#tb"); if (tb) tb.style.width = "0%";
    const card = $(".q-card");
    if (card) {
      card.appendChild(el("div", "reveal", `
        <div class="rv-top ${mine.correct ? "ok" : "no"}">
          ${mine.correct ? "ถูกต้อง +" + mine.points : (mine.pick === null ? "หมดเวลา" : "ผิด") + " +0"}
        </div>
        <div class="rv-ex">${esc(q.explain)}</div>
        <div class="rv-times">
          <span>คุณ ${mine.pick === null ? "ไม่ทัน" : fmtMs(mine.ms)} ${mine.correct ? "✔" : "✘"}</span>
          <span>คู่แข่ง ${theirs.pick === null ? "ไม่ทัน" : fmtMs(theirs.ms)} ${theirs.correct ? "✔" : "✘"} +${theirs.points}</span>
        </div>
        <button class="btn ghost sm" id="btnReport">แจ้งข้อผิดพลาดของคำถามนี้</button>`));
      $("#btnReport").onclick = e => {
        const n = reportQuestion(q.id);
        e.target.textContent = n >= 5 ? "พักการใช้งานคำถามนี้แล้ว" : `แจ้งแล้ว (${n}/5)`;
        e.target.disabled = true;
      };
    }
    await sleep(2300);
    resolve();
  });
}

function opponentLeft() {
  if (!M) { NET.leave(true); return; }
  if (M.finished || M.resultReceived) return;   // จบไปแล้ว การที่อีกฝั่งออกห้องเป็นเรื่องปกติ
  if (!M.started || !M.rounds.length && !M.current) {
    quitMatch(true).then(() => screenLobby("<b>คู่แข่งออกจากห้องแล้ว</b>"));
    return;
  }
  finishMatch(true, "opponent-left");
}

/* ================= จบแมตช์: สตรีค + MMR + สรุปผล ================= */
async function finishMatch(won, reason) {
  if (!M || M.finished) return;
  M.finished = true;
  clearInterval(M.tick); clearTimeout(M.hostTimer);
  const m = M;
  const opp = m.opp;
  M = null;
  await NET.leave();

  // สถิติสำหรับบอร์ด "คะแนนสูงสุด" และ "ตอบเร็วสุด"
  const myScore = m.scores[ME.id] || 0;
  if (myScore > (ME.bestScore || 0)) ME.bestScore = myScore;
  const fastRight = m.rounds.filter(r => r[ME.id].correct).map(r => r[ME.id].ms);
  if (fastRight.length) {
    const best = Math.min(...fastRight);
    if (ME.fastestMs == null || best < ME.fastestMs) ME.fastestMs = best;
  }
  ME.avgAnswerMs = ME.totalAnswers ? Math.round(ME.totalAnswerMs / ME.totalAnswers) : null;

  const before = { streak: ME.streak, mmr: ME.mmr, label: rankLabel(ME.mmr) };
  const events = applyResult(ME, won);
  const delta  = mmrDelta(ME, opp, won);
  const rankEvents = applyMmr(ME, delta.final);
  touchDaily(ME);
  ME.lastSeenAt = Date.now();
  await db.savePlayer(ME);

  await db.saveMatch({
    id: "m_" + Date.now().toString(36), players: [ME.id, opp.id], oppName: opp.displayName,
    questionIds: m.rounds.map(r => r.qid),
    rounds: m.rounds.map(r => ({ qid: r.qid, ...r[ME.id], oppCorrect: r[opp.id].correct, oppMs: r[opp.id].ms })),
    score: [m.scores[ME.id] || 0, m.scores[opp.id] || 0],
    winner: won ? 0 : 1, reason: reason || null,
    mmrDelta: [delta.final, -delta.final], streakAfter: [ME.streak, opp.streak || 0],
    endedAt: Date.now()
  });

  screenResult({ m, opp, won, reason, before, events, delta, rankEvents });
}

async function quitMatch(silent) {
  const wasPlaying = M && M.started && !M.finished && M.rounds !== undefined && (M.current || M.rounds.length);
  if (wasPlaying) {                 // ออกกลางแมตช์ = แพ้ ไม่งั้นสตรีคไม่มีความหมาย
    const opp = M.opp;
    M.finished = true;
    clearInterval(M.tick); clearTimeout(M.hostTimer);
    M = null;
    applyResult(ME, false);
    const d = mmrDelta(ME, opp, false);
    applyMmr(ME, d.final);
    await db.savePlayer(ME);
  }
  M = null;
  await NET.leave(silent);
}

function screenResult(r) {
  const { m, opp, won, reason, before, delta, rankEvents } = r;
  const myScore = m.scores[ME.id] || 0, oppScore = m.scores[opp.id] || 0;
  const rightCount = m.rounds.filter(x => x[ME.id].correct).length;
  const why = reason === "opponent-left" ? "คู่แข่งออกกลางคัน"
            : reason === "opponent-timeout" ? "คู่แข่งไม่ตอบ"
            : m.rounds.length > QUESTIONS_PER_MATCH
              ? `ตัดสินที่ Sudden Death ข้อที่ ${m.rounds.length - QUESTIONS_PER_MATCH}` : "";

  app.innerHTML = topbar("lobby") + `
    <main class="wrap">
      <section class="card result ${won ? "win" : "lose"}">
        <div class="res-title">${won ? "ชนะ!" : "แพ้"}</div>
        <div class="res-score">${myScore} <small>:</small> ${oppScore}</div>
        <div class="res-sub">${esc(ME.displayName)} vs ${esc(opp.displayName)} · ตอบถูก ${rightCount}/${m.rounds.length}
          ${why ? "· " + why : ""}</div>

        <div class="res-rows" id="resRows"></div>

        <div class="rounds">
          ${m.rounds.map((x, i) => `
            <div class="rrow ${x[ME.id].correct ? "ok" : "no"}">
              <span>${i + 1}</span>
              <span class="rq">${esc(qById(x.qid)?.text || "")}</span>
              <span>${fmtMs(x[ME.id].ms)}</span>
              <span class="rp">+${x[ME.id].points}</span>
            </div>`).join("")}
        </div>

        <div class="res-btns">
          <button class="btn primary" id="again">${CFG.online ? "หาคู่ใหม่" : "กลับห้องโถง"}</button>
          <button class="btn ghost" data-go="lobby">ห้องโถง</button>
        </div>
      </section>
    </main>`;
  bindNav();
  $("#again").onclick = CFG.online ? quickMatch : () => screenLobby();

  (async () => {
    const box = $("#resRows");
    const add = (cls, html) => {
      if (!box.isConnected) return;
      const d = el("div", "res-row " + cls, html);
      box.appendChild(d);
      d.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], 260);
    };

    await sleep(300);
    add("streak", `สตรีค ${before.streak} → <b>${ME.streak}</b>`);
    for (const e of r.events) {
      await sleep(550);
      if (e.type === "recovered")    add("good", `🔁 กู้สตรีค! ${e.from} → ${e.to}`);
      if (e.type === "newRecord")    add("gold", `🏆 สถิติใหม่ ${e.at} ชนะติดกัน`);
      if (e.type === "shieldEarned") add("good", `🛡 ได้โล่สตรีค 1 อัน`);
      if (e.type === "tierUp")       add("good", `🔥 โบนัส MMR ×${e.mult}`);
      if (e.type === "shieldUsed")   add("good", `🛡 ใช้โล่สตรีค — คงสตรีคไว้ที่ ${e.kept}`);
      if (e.type === "streakBroken") add("bad",  `💔 สตรีคขาด ${e.from} → 0 · ชนะภายใน 10 นาทีได้คืน ${Math.floor(e.from / 2) + 1}`);
    }

    await sleep(550);
    if (isPlacing(ME)) add("mmr", `จัดอันดับ ${ME.wins + ME.losses}/5 — ยังไม่เปิดเผยแรงค์`);
    else {
      let txt = `MMR ${before.mmr} → <b>${ME.mmr}</b> (${delta.final >= 0 ? "+" : ""}${delta.final})`;
      if (delta.streakMult > 1) txt += ` <i>· สตรีค ×${delta.streakMult}</i>`;
      if (delta.bounty)         txt += ` <i>· ล่าหัว +40%</i>`;
      if (delta.shielded)       txt += ` <i>· 🛡 โล่กันตกแรงค์</i>`;
      add("mmr", txt);
    }

    for (const e of rankEvents) {
      await sleep(600);
      if (e.type === "promote")   add("gold", `⬆ เลื่อนขั้น ${e.from} → ${e.to} · ได้โล่กันตกแรงค์`);
      if (e.type === "demote")    add("bad",  `⬇ ตกขั้น ${e.from} → ${e.to}`);
      if (e.type === "divChange") add(e.up ? "good" : "bad", `${e.up ? "⬆" : "⬇"} ${e.from} → ${e.to}`);
    }
    if (ME.streak >= 10) { await sleep(450); add("gold", `👑 ไตเติล "ไร้พ่าย" ติดโปรไฟล์ 24 ชม.`); }
  })();
}

/* ================= 06 · ลีดเดอร์บอร์ด ================= */
let boardTab = "mmr";
async function screenBoard() {
  M = null;
  const tabs = [
    { k: "mmr",   t: "แรงค์รวม",     f: "mmr",         note: "รีเซ็ตทุกซีซั่น 30 วัน" },
    { k: "score", t: "🏅 คะแนนสูงสุด", f: "bestScore",  note: "คะแนนรวมสูงสุดที่เคยทำได้ในแมตช์เดียว (10 ข้อ)" },
    { k: "fast",  t: "⚡ ตอบเร็วสุด",  f: "avgAnswerMs", asc: true, min: 10,
      note: "เวลาตอบเฉลี่ยต่ำสุด — ต้องตอบครบ 10 ข้อขึ้นไปถึงจะติดบอร์ด" },
    { k: "hot",   t: "สตรีคร้อนแรง", f: "streak",      note: "ไม่รีเซ็ต ขึ้นบอร์ดได้ในวันเดียว" },
    { k: "best",  t: "สถิติสตรีค",   f: "bestStreak",  note: "หอเกียรติยศถาวร" },
    { k: "fr",    t: "เพื่อน",       f: "mmr",         note: "แข่งกับคนที่คุณแอด" }
  ];
  const cur = tabs.find(t => t.k === boardTab);

  app.innerHTML = topbar("board") + `
    <main class="wrap"><section class="card"><div class="empty">กำลังโหลดบอร์ด…</div></section></main>`;
  bindNav();

  let rows = [];
  try { rows = await db.allPlayers(); }
  catch (e) { return app.querySelector(".card").innerHTML = `<div class="empty">โหลดบอร์ดไม่สำเร็จ: ${esc(e.message)}</div>`; }

  rows = rows.filter(p => (p.wins + p.losses) > 0 && p[cur.f] != null);
  if (cur.min)            rows = rows.filter(p => (p.totalAnswers || 0) >= cur.min);
  if (boardTab === "fr")  rows = rows.filter(p => p.id === ME.id || (ME.friends || []).includes(p.name));
  if (boardTab === "hot") rows = rows.filter(p => p.streak > 0);
  rows.sort((a, b) => cur.asc ? a[cur.f] - b[cur.f] : b[cur.f] - a[cur.f]);
  rows = rows.slice(0, 100);

  const myIdx = rows.findIndex(p => p.id === ME.id);
  const meRow = rows[myIdx];
  const above = myIdx > 0 ? rows[myIdx - 1] : null;
  const gap = above && meRow ? (above[cur.f] - meRow[cur.f]) : null;

  app.innerHTML = topbar("board") + `
    <main class="wrap">
      <section class="card">
        <div class="btabs">${tabs.map(t => `<button class="btab ${t.k === boardTab ? "sel" : ""}" data-b="${t.k}">${t.t}</button>`).join("")}</div>
        <p class="hint">${cur.note}${CFG.online ? "" : " · โหมดออฟไลน์: บอร์ดนี้เห็นเฉพาะบัญชีในเครื่องนี้"}</p>
        ${boardTab === "fr" ? `<div class="addfr">
            <input id="frName" placeholder="แอดเพื่อนด้วยชื่อผู้เล่น" maxlength="12">
            <button class="btn sm" id="frAdd">แอด</button></div>` : ""}
        <div class="board">
          ${rows.length ? rows.map((p, i) => boardRow(p, i + 1, cur.f)).join("")
                        : `<div class="empty">ยังไม่มีใครติดบอร์ดนี้ — เล่นแมตช์แรกเพื่อขึ้นเป็นคนแรก</div>`}
        </div>
        <div class="myrow">
          ${meRow ? boardRow(meRow, myIdx + 1, cur.f, true) : `<div class="empty">คุณยังไม่ติดบอร์ดนี้</div>`}
          ${gapText(cur, gap, myIdx)}
        </div>
      </section>
    </main>`;
  bindNav();
  $$("[data-b]").forEach(b => b.onclick = () => { boardTab = b.dataset.b; screenBoard(); });
  if (boardTab === "fr") $("#frAdd").onclick = async () => {
    const n = $("#frName").value.trim().toLowerCase();
    const f = await db.getPlayer(n);
    if (!f || f.id === ME.id) return alert("ไม่พบผู้เล่นชื่อนี้");
    ME.friends = [...new Set([...(ME.friends || []), n])];
    await db.savePlayer(ME);
    screenBoard();
  };
}

function gapText(cur, gap, myIdx) {
  if (gap == null) return "";
  const g = Math.abs(gap);
  if (cur.f === "mmr")          return `<div class="gap">อีก ${g + 1} แต้ม แซงอันดับ ${myIdx}</div>`;
  if (cur.f === "bestScore")    return `<div class="gap">อีก ${g + 1} คะแนน แซงอันดับ ${myIdx}</div>`;
  if (cur.f === "avgAnswerMs")  return `<div class="gap">เร็วขึ้นอีก ${(g / 1000).toFixed(1)} วิ แซงอันดับ ${myIdx}</div>`;
  return `<div class="gap">อีก ${g + 1} ชนะ แซงอันดับ ${myIdx}</div>`;
}

function boardRow(p, rank, field, isMe = false) {
  const val = field === "mmr" ? p.mmr + " MMR"
            : field === "bestScore" ? (p.bestScore || 0).toLocaleString() + " คะแนน"
            : field === "avgAnswerMs" ? ((p.avgAnswerMs || 0) / 1000).toFixed(2) + " วิ"
            : "🔥 " + (p[field] || 0);
  return `
    <div class="brow ${isMe || p.id === ME.id ? "me" : ""}">
      <span class="bno">${rank}</span>
      <span class="bav" style="--tc:${TIERS[rankOf(p.mmr).tier].color}">${esc((p.displayName || "?")[0])}</span>
      <span class="bname">${esc(p.displayName)}${p.streak >= 10 ? ' <b class="title">ไร้พ่าย</b>' : ""}</span>
      <span class="brank">${rankLabel(p.mmr)}</span>
      <span class="bval">${val}</span>
    </div>`;
}

/* ================= 06 · โปรไฟล์ ================= */
async function screenProfile() {
  M = null;
  const hist = await db.matchesOf(ME.id, 20);
  const r = rankOf(ME.mmr);

  app.innerHTML = topbar("profile") + `
    <main class="wrap">
      <section class="card prof-head">
        <div class="big-rank" style="--tc:${TIERS[r.tier].color}">
          <div class="rk-label">${isPlacing(ME) ? "จัดอันดับ" : rankLabel(ME.mmr)}</div>
          <div class="rk-mmr">${ME.mmr} MMR</div>
        </div>
        <div class="prof-streaks">
          <div><span>สตรีคปัจจุบัน</span><b>🔥 ${ME.streak}</b></div>
          <div><span>สถิติสูงสุด</span><b>🏆 ${ME.bestStreak}</b></div>
          <div><span>เข้าเล่นต่อเนื่อง</span><b>📅 ${ME.dailyStreak} วัน</b></div>
        </div>
      </section>

      <section class="grid4">
        <div class="card mini"><div class="k">ชนะ</div><div class="v">${ME.wins}</div></div>
        <div class="card mini"><div class="k">แพ้</div><div class="v">${ME.losses}</div></div>
        <div class="card mini"><div class="k">อัตราชนะ</div><div class="v">${winRate(ME)}%</div></div>
        <div class="card mini"><div class="k">เวลาตอบเฉลี่ย</div><div class="v">${avgMs(ME)}</div></div>
      </section>

      <section class="card">
        <h3>ความแม่นรายหมวด</h3>
        <div class="radar-wrap">${radarSvg(ME)}</div>
        <div class="catlist">${Object.entries(CATEGORIES).map(([k, c]) => {
          const s = ME.byCategory[k] || { c: 0, w: 0 }; const tot = s.c + s.w;
          return `<div class="catrow"><span style="color:${c.color}">${c.icon} ${c.label}</span>
                  <span>${tot ? Math.round(s.c / tot * 100) + "% (" + s.c + "/" + tot + ")" : "ยังไม่มีข้อมูล"}</span></div>`;
        }).join("")}</div>
      </section>

      <section class="card">
        <h3>ประวัติ 20 แมตช์ล่าสุด</h3>
        ${hist.length ? hist.map(m => `
          <details class="hist">
            <summary class="${m.winner === 0 ? "w" : "l"}">
              <b>${m.winner === 0 ? "ชนะ" : "แพ้"}</b>
              <span>${m.score[0]} : ${m.score[1]}</span>
              <span>vs ${esc(m.oppName || "?")}</span>
              <span class="hd">${m.mmrDelta[0] >= 0 ? "+" : ""}${m.mmrDelta[0]} MMR</span>
              <span class="ht">${new Date(m.endedAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</span>
            </summary>
            <div class="histbody">
              ${m.rounds.map(x => {
                const q = qById(x.qid); if (!q) return "";
                return `<div class="hq ${x.correct ? "ok" : "no"}">
                  <div class="hqt">${esc(q.text)}</div>
                  <div class="hqa">คำตอบที่ถูก: <b>${esc(q.choices[q.answer])}</b>${
                    x.correct ? "" : ` · คุณตอบ: ${x.pick == null ? "ไม่ทัน" : esc(q.choices[x.pick])}`}</div>
                  <div class="hqe">${esc(q.explain)}</div>
                </div>`;
              }).join("")}
            </div>
          </details>`).join("") : `<div class="empty">ยังไม่มีประวัติ</div>`}
      </section>
    </main>`;
  bindNav();
}

function radarSvg(p) {
  const keys = Object.keys(CATEGORIES);
  const n = keys.length, cx = 130, cy = 125, R = 92;
  const pt = (i, r) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  const ring = f => keys.map((_, i) => pt(i, R * f).join(",")).join(" ");
  const vals = keys.map(k => { const s = p.byCategory[k] || { c: 0, w: 0 }; const t = s.c + s.w; return t ? s.c / t : 0; });
  const poly = vals.map((v, i) => pt(i, R * Math.max(0.04, v)).join(",")).join(" ");
  return `<svg viewBox="0 0 260 250" class="radar">
    ${[0.25, 0.5, 0.75, 1].map(f => `<polygon points="${ring(f)}" class="rg"/>`).join("")}
    ${keys.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${pt(i, R)[0]}" y2="${pt(i, R)[1]}" class="rl"/>`).join("")}
    <polygon points="${poly}" class="rv"/>
    ${keys.map((k, i) => { const [x, y] = pt(i, R + 18); return `<text x="${x}" y="${y}" class="rt" text-anchor="middle">${CATEGORIES[k].icon}</text>`; }).join("")}
  </svg>`;
}

/* ================= boot ================= */
window.addEventListener("beforeunload", e => {
  if (!M || !M.started || M.finished) return;
  const opp = M.opp;
  M.finished = true;
  applyResult(ME, false);
  const d = mmrDelta(ME, opp, false);
  applyMmr(ME, d.final);
  db.savePlayer(ME);
  NET.leave();
  e.preventDefault(); e.returnValue = "";
});

(async function boot() {
  const s = db.getSession();
  if (s) {
    try {
      const p = await db.getPlayerById(s.id);
      if (p) { ME = p; touchDaily(p); await db.savePlayer(p); return screenLobby(); }
    } catch (e) { return screenLogin("ต่อเซิร์ฟเวอร์ไม่ได้: " + e.message); }
  }
  screenLogin();
})();
