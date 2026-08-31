/* ---------- helper DOM ---------- */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmtMs = ms => (ms / 1000).toFixed(1) + " วิ";

const app = $("#app");
let ME = null;            // ผู้เล่นปัจจุบัน
let MATCH = null;         // แมตช์ที่กำลังเล่น (null = ไม่ได้อยู่ในแมตช์)

/* ================= หน้าจอ: ล็อกอิน ================= */
function screenLogin(msg) {
  MATCH = null;
  app.innerHTML = `
    <div class="center-wrap">
      <div class="brand">
        <div class="brand-badge">TD</div>
        <h1>Tech Duel</h1>
        <p class="sub">ดวลความรู้เทคโนโลยี 1v1 · 5 ข้อ · ไต่แรงค์ Bronze → Master</p>
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
        <p class="warn">⚠ รหัส 6 หลักมีความเป็นไปได้แค่ 1 ล้านแบบ และข้อมูลเก็บใน localStorage ของเครื่องนี้
        ใครเปิด DevTools ก็แก้แต้มได้ — <b>อย่าใช้รหัสเดียวกับบัญชีอื่น</b> เกมนี้ไม่ได้ออกแบบให้เก็บข้อมูลสำคัญ</p>
      </form>
    </div>`;

  $("#loginForm").onsubmit = async e => {
    e.preventDefault();
    const btn = $("#loginForm button");
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

/* ================= หน้าจอ: ห้องโถง ================= */
function topbar(active) {
  const r = rankOf(ME.mmr);
  const hot = ME.streak >= 5;
  return `
  <header class="topbar ${hot ? "hot" : ""}">
    <div class="who">
      <span class="rank-chip" style="--tc:${TIERS[r.tier].color}">
        ${isPlacing(ME) ? "จัดอันดับ " + (ME.wins + ME.losses) + "/5" : rankLabel(ME.mmr)}
      </span>
      <b>${esc(ME.displayName)}</b>
      <span class="streak-chip ${ME.streak >= 3 ? "on" : ""}" title="ชนะต่อเนื่อง">
        🔥 ${ME.streak}${ME.streakShield ? " 🛡" : ""}
      </span>
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
  $$("[data-go]").forEach(b => b.onclick = () => {
    const go = b.dataset.go;
    if (go === "lobby") screenLobby();
    if (go === "board") screenBoard();
    if (go === "profile") screenProfile();
    if (go === "logout") { db.clearSession(); ME = null; screenLogin(); }
  });
}

function screenLobby(flash) {
  MATCH = null;
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
          <button class="btn primary big" id="btnDuel">เริ่มดวล 5 ข้อ</button>
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
              <span class="lad-at">${s.at}</span>
              <span class="lad-l">${s.label}</span>
              <span class="lad-n">${s.note}</span>
            </div>`).join("")}
        </div>
        <p class="hint">แพ้แล้วชนะภายใน 10 นาที = กู้สตรีคคืนครึ่งหนึ่ง · โล่สตรีคกันตัวนับ ไม่กัน MMR</p>
      </section>
    </main>`;
  bindNav();
  $("#btnDuel").onclick = startDuel;
}

const winRate = p => (p.wins + p.losses) ? Math.round(p.wins / (p.wins + p.losses) * 100) : 0;
const avgMs   = p => p.totalAnswers ? (p.totalAnswerMs / p.totalAnswers / 1000).toFixed(1) + " วิ" : "—";

/* ================= 04 · การดวล ================= */
async function startDuel() {
  const opp = await makeGhost(ME.mmr);
  const qs  = pickQuestions(ME, 5);
  MATCH = {
    id: "m_" + Date.now().toString(36),
    opp, qs, rounds: [], score: [0, 0], idx: 0, forfeit: false
  };

  await screenMatchmaking(opp);
  if (!MATCH) return;

  for (MATCH.idx = 0; MATCH.idx < qs.length; MATCH.idx++) {
    const done = await playRound(qs[MATCH.idx], MATCH.idx + 1, qs.length);
    if (!done) return;                       // ออกกลางคัน
  }

  // เสมอ = ต่อ Sudden Death
  let sd = 0;
  while (MATCH.score[0] === MATCH.score[1] && sd < 5) {
    sd++;
    const extra = pickQuestions(ME, 1)[0];
    const done = await playRound(extra, "SD" + sd, null, true);
    if (!done) return;
  }

  finishMatch();
}

function screenMatchmaking(opp) {
  return new Promise(async resolve => {
    app.innerHTML = topbar("lobby") + `
      <main class="wrap">
        <section class="card vs-card">
          <div class="finding">กำลังหาคู่แข่งที่ระดับใกล้กัน…</div>
        </section>
      </main>`;
    bindNav();
    await sleep(900);
    if (!MATCH) return resolve();
    const oppRank = rankLabel(opp.mmr);
    $(".vs-card").innerHTML = `
      <div class="vs">
        <div class="vs-side">
          <div class="av me">${esc(ME.displayName[0] || "?")}</div>
          <b>${esc(ME.displayName)}</b>
          <span>${isPlacing(ME) ? "ยังจัดอันดับ" : rankLabel(ME.mmr)}</span>
          <span class="sk">🔥 ${ME.streak}</span>
        </div>
        <div class="vs-mid">VS</div>
        <div class="vs-side">
          <div class="av opp">${esc(opp.displayName[0])}</div>
          <b>${esc(opp.displayName)}</b>
          <span>${oppRank}</span>
          <span class="sk">🔥 ${opp.streak}</span>
        </div>
      </div>
      ${opp.streak >= 15 ? `<div class="bounty">⚠ ผู้เล่นนี้ชนะติดกัน ${opp.streak} แมตช์ — ล้มได้ MMR +40%</div>` : ""}
      <div class="cd" id="cd">3</div>`;
    for (const n of ["3", "2", "1", "เริ่ม!"]) {
      if (!MATCH) return resolve();
      $("#cd").textContent = n;
      $("#cd").animate([{ transform: "scale(1.6)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], 300);
      await sleep(650);
    }
    resolve();
  });
}

function playRound(q, no, total, sudden = false) {
  return new Promise(async resolve => {
    const ghost = ghostAnswer(q, MATCH.opp);
    let answered = false, myMs = null, myPick = null;
    const t0 = performance.now();

    app.innerHTML = topbar("lobby") + `
      <main class="wrap">
        <section class="card q-card">
          <div class="q-head">
            <span class="q-no">${sudden ? "SUDDEN DEATH" : `ข้อ ${no} / ${total}`}</span>
            <span class="q-cat" style="--tc:${CATEGORIES[q.category].color}">
              ${CATEGORIES[q.category].icon} ${CATEGORIES[q.category].label} · ระดับ ${effectiveDifficulty(q)}
            </span>
            <span class="q-score">${MATCH.score[0]} : ${MATCH.score[1]}</span>
          </div>
          <div class="timebar"><i id="tb"></i></div>
          <div class="oppstate" id="oppState">คู่แข่งกำลังคิด…</div>
          <h2 class="q-text">${esc(q.text)}</h2>
          <div class="choices" id="choices">
            ${q.choices.map((c, i) => `<button class="choice" data-i="${i}">${esc(c)}</button>`).join("")}
          </div>
        </section>
      </main>`;
    bindNav();

    const oppTimer = setTimeout(() => {
      const s = $("#oppState");
      if (s) { s.textContent = "คู่แข่งตอบแล้ว"; s.classList.add("done"); }
    }, ghost.ms);

    const tick = setInterval(() => {
      const left = Math.max(0, LIMIT_MS - (performance.now() - t0));
      const tb = $("#tb");
      if (!tb) return;
      tb.style.width = (left / LIMIT_MS * 100) + "%";
      tb.classList.toggle("danger", left < 3000);
      if (left <= 0) submit(null);
    }, 60);

    $$("#choices .choice").forEach(b => b.onclick = () => submit(+b.dataset.i));

    // ออกกลางคัน = แพ้
    const onHide = () => { if (document.hidden) hiddenAt = Date.now(); else if (hiddenAt && Date.now() - hiddenAt > 2000) forfeit(); };
    let hiddenAt = 0;
    document.addEventListener("visibilitychange", onHide);

    function cleanup() {
      clearInterval(tick); clearTimeout(oppTimer);
      document.removeEventListener("visibilitychange", onHide);
    }

    function forfeit() {
      if (answered) return;
      answered = true; cleanup();
      MATCH.forfeit = true;
      finishMatch(true);
      resolve(false);
    }

    async function submit(pick) {
      if (answered) return;
      answered = true; cleanup();
      myPick = pick;
      myMs = Math.min(LIMIT_MS, Math.round(performance.now() - t0));
      const correct = pick === q.answer;
      const iFirst = myMs < ghost.ms;

      const myPts  = roundPoints(correct, myMs, correct && iFirst);
      const oppPts = roundPoints(ghost.correct, ghost.ms, ghost.correct && !iFirst);
      MATCH.score[0] += myPts;
      MATCH.score[1] += oppPts;
      MATCH.rounds.push({ qid: q.id, pick, correct, ms: myMs, points: myPts,
                          oppCorrect: ghost.correct, oppMs: ghost.ms, oppPoints: oppPts });

      // สถิติผู้เล่นและคลังคำถาม
      ME.totalAnswers++; ME.totalAnswerMs += myMs;
      const bc = (ME.byCategory[q.category] ||= { c: 0, w: 0 });
      correct ? bc.c++ : bc.w++;
      ME.recentIds = [q.id, ...(ME.recentIds || [])].slice(0, 50);
      recordAnswer(q, correct, myMs, ME.mmr);
      await db.savePlayer(ME);

      await showReveal(q, pick, correct, myMs, myPts, ghost, oppPts, sudden);
      resolve(true);
    }
  });
}

function showReveal(q, pick, correct, myMs, myPts, ghost, oppPts, sudden) {
  return new Promise(async resolve => {
    $$("#choices .choice").forEach(b => {
      const i = +b.dataset.i;
      b.disabled = true;
      if (i === q.answer) b.classList.add("right");
      else if (i === pick) b.classList.add("wrong");
    });
    $("#tb").style.width = "0%";
    const card = $(".q-card");
    card.appendChild(el("div", "reveal", `
      <div class="rv-top ${correct ? "ok" : "no"}">${correct ? "ถูกต้อง +" + myPts : (pick === null ? "หมดเวลา" : "ผิด") + " +0"}</div>
      <div class="rv-ex">${esc(q.explain)}</div>
      <div class="rv-times">
        <span>คุณ ${pick === null ? "ไม่ทัน" : fmtMs(myMs)} ${correct ? "✔" : "✘"}</span>
        <span>คู่แข่ง ${fmtMs(ghost.ms)} ${ghost.correct ? "✔" : "✘"} +${oppPts}</span>
      </div>
      <button class="btn ghost sm" id="btnReport">แจ้งข้อผิดพลาดของคำถามนี้</button>
    `));
    $("#btnReport").onclick = e => {
      const n = reportQuestion(q.id);
      e.target.textContent = n >= 5 ? "พักการใช้งานคำถามนี้แล้ว" : `แจ้งแล้ว (${n}/5)`;
      e.target.disabled = true;
    };
    await sleep(sudden ? 1600 : 2100);
    resolve();
  });
}

/* ================= จบแมตช์: สตรีค + MMR + สรุปผล ================= */
async function finishMatch(forfeited = false) {
  const m = MATCH;
  if (!m) return;
  MATCH = null;

  let won = forfeited ? false : m.score[0] > m.score[1];
  // เสมอสนิทหลัง Sudden Death ครบ 5 ข้อ ตัดสินด้วยจำนวนข้อถูก แล้วจึงเวลารวม
  if (!forfeited && m.score[0] === m.score[1]) {
    const myRight  = m.rounds.filter(r => r.correct).length;
    const oppRight = m.rounds.filter(r => r.oppCorrect).length;
    const myTime   = m.rounds.reduce((a, r) => a + r.ms, 0);
    const oppTime  = m.rounds.reduce((a, r) => a + r.oppMs, 0);
    won = myRight !== oppRight ? myRight > oppRight : myTime <= oppTime;
  }
  const before = { streak: ME.streak, mmr: ME.mmr, label: rankLabel(ME.mmr), best: ME.bestStreak };

  const events = applyResult(ME, won);
  const delta  = mmrDelta(ME, m.opp, won);
  const rankEvents = applyMmr(ME, delta.final);
  touchDaily(ME);
  ME.lastSeenAt = Date.now();
  await db.savePlayer(ME);

  await applyOpponentResult(m.opp, !won, -delta.final);

  await db.saveMatch({
    id: m.id, players: [ME.id, m.opp.id], oppName: m.opp.displayName,
    questionIds: m.qs.map(q => q.id), rounds: m.rounds,
    score: m.score, winner: won ? 0 : 1, forfeit: forfeited,
    mmrDelta: [delta.final, -delta.final], streakAfter: [ME.streak, m.opp.streak],
    endedAt: Date.now()
  });

  screenResult({ m, won, forfeited, before, events, delta, rankEvents });
}

function screenResult(r) {
  const { m, won, forfeited, before, delta, rankEvents } = r;
  const rightCount = m.rounds.filter(x => x.correct).length;

  app.innerHTML = topbar("lobby") + `
    <main class="wrap">
      <section class="card result ${won ? "win" : "lose"}">
        <div class="res-title">${forfeited ? "ออกกลางคัน = แพ้" : won ? "ชนะ!" : "แพ้"}</div>
        <div class="res-score">${m.score[0]} <small>:</small> ${m.score[1]}</div>
        <div class="res-sub">${esc(ME.displayName)} vs ${esc(m.opp.displayName)} · ตอบถูก ${rightCount}/${m.rounds.length}</div>

        <div class="res-rows" id="resRows"></div>

        <div class="rounds">
          ${m.rounds.map((x, i) => `
            <div class="rrow ${x.correct ? "ok" : "no"}">
              <span>${i + 1}</span>
              <span class="rq">${esc(QUESTION_BANK.find(q => q.id === x.qid).text)}</span>
              <span>${x.ms ? fmtMs(x.ms) : "-"}</span>
              <span class="rp">+${x.points}</span>
            </div>`).join("")}
        </div>

        <div class="res-btns">
          <button class="btn primary" id="again">แก้มือทันที</button>
          <button class="btn ghost" data-go="lobby">กลับห้องโถง</button>
        </div>
      </section>
    </main>`;
  bindNav();
  $("#again").onclick = startDuel;

  // เล่น event ทีละอันตามคิว ไม่ให้เอฟเฟกต์ทับกัน
  (async () => {
    const box = $("#resRows");
    const add = (cls, html) => { const d = el("div", "res-row " + cls, html); box.appendChild(d); d.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], 260); };

    await sleep(350);
    add("streak", `สตรีค ${before.streak} → <b>${ME.streak}</b>`);
    for (const e of r.events) {
      await sleep(600);
      if (e.type === "recovered")    add("good", `🔁 กู้สตรีค! ${e.from} → ${e.to}`);
      if (e.type === "newRecord")    add("gold", `🏆 สถิติใหม่ ${e.at} ชนะติดกัน`);
      if (e.type === "shieldEarned") add("good", `🛡 ได้โล่สตรีค 1 อัน`);
      if (e.type === "tierUp")       add("good", `🔥 โบนัส MMR ×${e.mult}`);
      if (e.type === "shieldUsed")   add("good", `🛡 ใช้โล่สตรีค — คงสตรีคไว้ที่ ${e.kept}`);
      if (e.type === "streakBroken") add("bad",  `💔 สตรีคขาด ${e.from} → 0 · ชนะภายใน 10 นาทีได้คืน ${Math.floor(e.from / 2) + 1}`);
    }

    await sleep(600);
    if (isPlacing(ME)) {
      add("mmr", `จัดอันดับ ${ME.wins + ME.losses}/5 — ยังไม่เปิดเผยแรงค์`);
    } else {
      let txt = `MMR ${before.mmr} → <b>${ME.mmr}</b> (${delta.final >= 0 ? "+" : ""}${delta.final})`;
      if (delta.streakMult > 1) txt += ` <i>· สตรีค ×${delta.streakMult}</i>`;
      if (delta.bounty)         txt += ` <i>· ล่าหัว +40%</i>`;
      if (delta.shielded)       txt += ` <i>· 🛡 โล่กันตกแรงค์</i>`;
      add("mmr", txt);
    }

    for (const e of rankEvents) {
      await sleep(650);
      if (e.type === "promote")   add("gold", `⬆ เลื่อนขั้น ${e.from} → ${e.to} · ได้โล่กันตกแรงค์`);
      if (e.type === "demote")    add("bad",  `⬇ ตกขั้น ${e.from} → ${e.to}`);
      if (e.type === "divChange") add(e.up ? "good" : "bad", `${e.up ? "⬆" : "⬇"} ${e.from} → ${e.to}`);
    }

    if (ME.streak >= 10) { await sleep(500); add("gold", `👑 ไตเติล "ไร้พ่าย" ติดโปรไฟล์ 24 ชม.`); }
  })();
}

/* ================= 06 · ลีดเดอร์บอร์ด ================= */
let boardTab = "mmr";
async function screenBoard() {
  MATCH = null;
  const tabs = [
    { k: "mmr",  t: "แรงค์รวม",      f: "mmr",        note: "รีเซ็ตทุกซีซั่น 30 วัน" },
    { k: "hot",  t: "สตรีคร้อนแรง",  f: "streak",     note: "ไม่รีเซ็ต ขึ้นบอร์ดได้ในวันเดียว" },
    { k: "best", t: "สถิติสตรีค",    f: "bestStreak", note: "หอเกียรติยศถาวร" },
    { k: "fr",   t: "เพื่อน",        f: "mmr",        note: "แข่งกับคนที่คุณแอด" }
  ];
  const cur = tabs.find(t => t.k === boardTab);
  let rows = await db.topPlayers(cur.f, 100);
  if (boardTab === "fr") rows = rows.filter(p => p.id === ME.id || (ME.friends || []).includes(p.name));
  if (boardTab === "hot") rows = rows.filter(p => p.streak > 0);

  const myIdx = rows.findIndex(p => p.id === ME.id);
  const meRow = rows[myIdx];
  const above = myIdx > 0 ? rows[myIdx - 1] : null;
  const gap = above && meRow ? (above[cur.f] - meRow[cur.f]) : null;

  app.innerHTML = topbar("board") + `
    <main class="wrap">
      <section class="card">
        <div class="btabs">${tabs.map(t => `<button class="btab ${t.k === boardTab ? "sel" : ""}" data-b="${t.k}">${t.t}</button>`).join("")}</div>
        <p class="hint">${cur.note}</p>
        ${boardTab === "fr" ? `
          <div class="addfr">
            <input id="frName" placeholder="แอดเพื่อนด้วยชื่อผู้เล่น" maxlength="12">
            <button class="btn sm" id="frAdd">แอด</button>
          </div>` : ""}
        <div class="board">
          ${rows.length ? rows.slice(0, 100).map((p, i) => boardRow(p, i + 1, cur.f)).join("")
                        : `<div class="empty">ยังไม่มีใครติดบอร์ดนี้ — เล่นแมตช์แรกเพื่อขึ้นเป็นคนแรก</div>`}
        </div>
        <div class="myrow">
          ${meRow ? boardRow(meRow, myIdx + 1, cur.f, true) : `<div class="empty">คุณยังไม่ติดบอร์ดนี้</div>`}
          ${gap != null && gap >= 0 ? `<div class="gap">อีก ${gap + 1} ${cur.f === "mmr" ? "แต้ม" : "ชนะ"} แซงอันดับ ${myIdx}</div>` : ""}
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

function boardRow(p, rank, field, isMe = false) {
  const val = field === "mmr" ? p.mmr + " MMR" : "🔥 " + (p[field] || 0);
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
  MATCH = null;
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
          const s = ME.byCategory[k] || { c: 0, w: 0 };
          const tot = s.c + s.w;
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
                const q = QUESTION_BANK.find(qq => qq.id === x.qid);
                if (!q) return "";
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
  const pt = (i, r) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / n;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  const ring = f => keys.map((_, i) => pt(i, R * f).join(",")).join(" ");
  const vals = keys.map(k => {
    const s = p.byCategory[k] || { c: 0, w: 0 };
    const t = s.c + s.w;
    return t ? s.c / t : 0;
  });
  const poly = vals.map((v, i) => pt(i, R * Math.max(0.04, v)).join(",")).join(" ");
  return `<svg viewBox="0 0 260 250" class="radar">
    ${[0.25, 0.5, 0.75, 1].map(f => `<polygon points="${ring(f)}" class="rg"/>`).join("")}
    ${keys.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${pt(i, R)[0]}" y2="${pt(i, R)[1]}" class="rl"/>`).join("")}
    <polygon points="${poly}" class="rv"/>
    ${keys.map((k, i) => {
      const [x, y] = pt(i, R + 18);
      return `<text x="${x}" y="${y}" class="rt" text-anchor="middle">${CATEGORIES[k].icon}</text>`;
    }).join("")}
  </svg>`;
}

/* ================= boot ================= */
window.addEventListener("beforeunload", e => {
  if (!MATCH) return;
  // ปิดแท็บกลางแมตช์ = แพ้ บันทึกทันทีแบบซิงโครนัส ไม่งั้นสตรีคจะไม่มีความหมาย
  const opp = MATCH.opp;
  MATCH = null;
  applyResult(ME, false);
  const d = mmrDelta(ME, opp, false);
  applyMmr(ME, d.final);
  db.savePlayer(ME);
  e.preventDefault(); e.returnValue = "";
});

(async function boot() {
  await seedBots();
  const s = db.getSession();
  if (s) {
    const p = await db.getPlayerById(s.id);
    if (p) { ME = p; touchDaily(p); await db.savePlayer(p); return screenLobby(); }
  }
  screenLogin();
})();
