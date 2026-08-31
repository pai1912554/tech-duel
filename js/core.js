/* ตรรกะเกมทั้งหมด: ล็อกอิน, สตรีค, MMR, แรงค์, คะแนน, การเลือกคำถาม, ผี
   ไฟล์นี้ไม่แตะ DOM เลยแม้แต่บรรทัดเดียว — คืนค่าและ event ให้ ui.js ไปเล่นเอง */

/* ============ 02 · ล็อกอิน ============ */
async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(pin + ":" + salt);
  if (crypto?.subtle?.digest) {
    const buf = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  // สำรองกรณีเบราว์เซอร์ไม่มี WebCrypto (อ่อนกว่ามาก ใช้เฉพาะไม่ให้เกมพัง)
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (const b of data) { h1 = (h1 ^ b) * 16777619 >>> 0; h2 = (h2 + b) * 2654435761 >>> 0; }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

function validPin(pin) {
  if (!/^\d{6}$/.test(pin)) return "รหัสต้องเป็นตัวเลข 6 ตัว";
  if (/^(\d)\1{5}$/.test(pin)) return "ห้ามใช้เลขซ้ำทั้งหมด";
  if ("0123456789".includes(pin) || "9876543210".includes(pin)) return "ห้ามใช้เลขเรียง";
  return null;
}

function validName(name) {
  if (!/^[a-z0-9_ก-๙]{3,12}$/.test(name)) return "ชื่อ 3–12 ตัว ใช้ a-z 0-9 _ และภาษาไทย";
  return null;
}

function newPlayer(name, displayName, pinHash, salt) {
  return {
    id: "p_" + Math.random().toString(36).slice(2, 8),
    name, displayName, pinHash, salt,
    mmr: 1000, shield: 0,
    streak: 0, bestStreak: 0, streakShield: 0,
    pendingRecover: 0, lastLossAt: null,
    dailyStreak: 1, lastPlayDay: todayKey(),
    wins: 0, losses: 0,
    totalAnswerMs: 0, totalAnswers: 0,
    byCategory: Object.fromEntries(Object.keys(CATEGORIES).map(k => [k, { c: 0, w: 0 }])),
    recentIds: [], friends: [],
    fails: 0, lockUntil: 0,
    createdAt: Date.now(), lastSeenAt: Date.now()
  };
}

const todayKey = () => new Date().toISOString().slice(0, 10);

async function login(rawName, pin) {
  const perr = validPin(pin);       if (perr) throw new Error(perr);
  const name = rawName.trim().toLowerCase();
  const nerr = validName(name);     if (nerr) throw new Error(nerr);

  let p = await db.getPlayer(name);

  if (!p) {                                    // ยังไม่มีชื่อนี้ = สมัครใหม่ทันที
    const salt = crypto.randomUUID().slice(0, 8);
    p = newPlayer(name, rawName.trim(), await hashPin(pin, salt), salt);
    await db.savePlayer(p);
    db.setSession(p.id);
    return { player: p, created: true };
  }

  if (p.lockUntil > Date.now())
    throw new Error("ลองผิดหลายครั้ง รออีก " + Math.ceil((p.lockUntil - Date.now()) / 60000) + " นาที");

  if (await hashPin(pin, p.salt) !== p.pinHash) {
    p.fails = (p.fails || 0) + 1;
    if (p.fails >= 5) { p.lockUntil = Date.now() + 15 * 60000; p.fails = 0; }
    await db.savePlayer(p);
    throw new Error("ชื่อนี้มีคนใช้แล้ว และรหัสไม่ถูกต้อง");
  }

  p.fails = 0;
  touchDaily(p);
  p.lastSeenAt = Date.now();
  await db.savePlayer(p);
  db.setSession(p.id);
  return { player: p, created: false };
}

function touchDaily(p) {
  const today = todayKey();
  if (p.lastPlayDay === today) return;
  const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  p.dailyStreak = (p.lastPlayDay === yest) ? (p.dailyStreak || 0) + 1 : 1;
  p.lastPlayDay = today;
}

/* ============ 03 · ระบบชนะต่อเนื่อง ============ */
const STREAK_MULT = [
  { at: 10, mult: 2.0 },
  { at: 5,  mult: 1.5 },
  { at: 3,  mult: 1.25 }
];

function streakMultiplier(streak) {
  for (const s of STREAK_MULT) if (streak >= s.at) return s.mult;
  return 1;
}

/* บันไดสตรีค — ใช้ทั้งแสดงผลและปลดล็อกรางวัล */
const STREAK_LADDER = [
  { at: 1,  label: "เริ่มนับ",        note: "ยังไม่มีโบนัส" },
  { at: 3,  label: "กำลังมา",         note: "MMR ×1.25" },
  { at: 5,  label: "ร้อนแรง",         note: "MMR ×1.5 + โล่สตรีค" },
  { at: 7,  label: "ขึ้นบอร์ด",       note: "ติดบอร์ดสตรีคร้อนแรง" },
  { at: 10, label: "ไร้พ่าย",          note: "MMR ×2 + ไตเติล 24 ชม." },
  { at: 15, label: "เป้าใหญ่",        note: "คู่แข่งได้โบนัสล่าหัว +40%" }
];

const ladderOf = s => [...STREAK_LADDER].reverse().find(x => s >= x.at) || null;

/* เรียกครั้งเดียวหลังจบแมตช์ ก่อนคำนวณ MMR — คืน list ของ event ให้ UI เล่นตามคิว */
function applyResult(p, won) {
  const before = p.streak;
  const events = [];

  if (won) {
    if (p.pendingRecover && p.lastLossAt && Date.now() - p.lastLossAt < 600000) {
      p.streak = Math.floor(p.pendingRecover / 2) + 1;
      events.push({ type: "recovered", from: p.pendingRecover, to: p.streak });
    } else {
      p.streak = before + 1;
    }
    p.pendingRecover = 0;
    p.wins++;
    if (p.streak > p.bestStreak) {
      p.bestStreak = p.streak;
      events.push({ type: "newRecord", at: p.streak });
    }
    if (p.streak >= 5 && p.streakShield < 1) {
      p.streakShield = 1;
      events.push({ type: "shieldEarned" });
    }
    if (streakMultiplier(p.streak) > streakMultiplier(before))
      events.push({ type: "tierUp", mult: streakMultiplier(p.streak) });
  } else {
    p.losses++;
    p.lastLossAt = Date.now();
    if (p.streakShield > 0) {
      p.streakShield--;
      events.push({ type: "shieldUsed", kept: p.streak });
    } else {
      p.pendingRecover = before;
      p.streak = 0;
      if (before >= 3) events.push({ type: "streakBroken", from: before });
    }
  }
  return events;
}

/* ============ 05 · แรงค์ & MMR ============ */
const TIERS = {
  bronze:   { label: "Bronze",   color: "#c07a4a", floor: 0 },
  silver:   { label: "Silver",   color: "#b8c2cc", floor: 1000 },
  gold:     { label: "Gold",     color: "#ffc94a", floor: 1400 },
  platinum: { label: "Platinum", color: "#5ad9c6", floor: 1800 },
  diamond:  { label: "Diamond",  color: "#6bb6ff", floor: 2200 },
  master:   { label: "Master",   color: "#e06bff", floor: 2600 }
};

/* [floor, tier, ความกว้างของ tier] — bronze กว้าง 1000 ที่เหลือกว้าง 400
   แบ่ง 3 ดิวิชั่นเท่า ๆ กันในแต่ละ tier ไม่ใช่ตายตัว 133 แต้ม ไม่งั้น Bronze จะเป็น I ตั้งแต่ 400 แต้ม */
const TIER_TABLE = [
  [2600, "master",   0],
  [2200, "diamond",  400],
  [1800, "platinum", 400],
  [1400, "gold",     400],
  [1000, "silver",   400],
  [0,    "bronze",   1000]
];

function rankOf(mmr) {
  for (const [floor, tier, width] of TIER_TABLE) {
    if (mmr >= floor) {
      if (tier === "master") return { tier, div: 0 };
      const step = width / 3;
      return { tier, div: Math.min(3, Math.max(1, 3 - Math.floor((mmr - floor) / step))) };
    }
  }
  return { tier: "bronze", div: 3 };
}

const ROMAN = { 1: "I", 2: "II", 3: "III" };
const rankLabel = mmr => {
  const r = rankOf(mmr);
  return TIERS[r.tier].label + (r.div ? " " + ROMAN[r.div] : "");
};

const PLACEMENT = 5;                                  // ซ่อนแรงค์ 5 แมตช์แรก
const isPlacing = p => (p.wins + p.losses) < PLACEMENT;

function wouldDemote(me, delta) {
  return rankOf(me.mmr + delta).tier !== rankOf(me.mmr).tier;
}

/* คำนวณ MMR — เรียกหลัง applyResult เสมอ (สูตรใช้สตรีคหลังอัปเดต) */
function mmrDelta(me, opp, won) {
  const expected = 1 / (1 + Math.pow(10, (opp.mmr - me.mmr) / 400));
  const K = (me.wins + me.losses) < 10 ? 48 : 32;     // มือใหม่ขยับเร็ว
  let d = K * ((won ? 1 : 0) - expected);
  const detail = { base: Math.round(d), streakMult: 1, bounty: false, shielded: false };

  if (won) {
    detail.streakMult = streakMultiplier(me.streak);
    d *= detail.streakMult;
    if (opp.streak >= 15) { d *= 1.4; detail.bounty = true; }
  } else if (me.shield > 0 && wouldDemote(me, d)) {
    me.shield--; d = 0; detail.shielded = true;
  }
  detail.final = Math.round(d);
  return detail;
}

/* ให้โล่กันตกแรงค์ทุกครั้งที่เลื่อน tier */
function applyMmr(p, delta) {
  const beforeTier = rankOf(p.mmr).tier;
  const beforeLabel = rankLabel(p.mmr);
  p.mmr = Math.max(0, p.mmr + delta);
  const afterTier = rankOf(p.mmr).tier;
  const afterLabel = rankLabel(p.mmr);
  const evts = [];
  if (afterTier !== beforeTier && TIERS[afterTier].floor > TIERS[beforeTier].floor) {
    p.shield = 1;
    evts.push({ type: "promote", from: beforeLabel, to: afterLabel });
  } else if (afterTier !== beforeTier) {
    evts.push({ type: "demote", from: beforeLabel, to: afterLabel });
  } else if (afterLabel !== beforeLabel) {
    evts.push({ type: "divChange", up: delta > 0, from: beforeLabel, to: afterLabel });
  }
  return evts;
}

/* ============ 04 · คะแนนต่อข้อ ============ */
const LIMIT_MS = 10000;

function roundPoints(correct, ms, isFirst) {
  if (!correct) return 0;
  const left = Math.max(0, LIMIT_MS - ms) / LIMIT_MS;
  return Math.round(300 + 700 * left) + (isFirst ? 100 : 0);
}

/* ============ 07 · คลังคำถาม ============ */
function questionStats(q) {
  const s = db.qstats()[q.id];
  return s || { seenCorrect: 0, seenTotal: 0, times: [], reports: 0, diffAdj: 0 };
}

function effectiveDifficulty(q) {
  const s = questionStats(q);
  let d = q.difficulty;
  if (s.seenTotal >= 10) {
    const rate = s.seenCorrect / s.seenTotal;
    if (rate > 0.9) d -= 1;
    else if (rate < 0.3) d += 1;
  }
  return Math.min(5, Math.max(1, d));
}

const isSuspended = q => questionStats(q).reports >= 5;

function pickQuestions(player, n = 5) {
  const target = Math.min(5, Math.max(1, Math.round(player.mmr / 520)));
  const recent = new Set(player.recentIds || []);
  let pool = QUESTION_BANK.filter(q => !isSuspended(q) && !recent.has(q.id));
  if (pool.length < n) pool = QUESTION_BANK.filter(q => !isSuspended(q));

  // จัดกลุ่มตามระยะห่างจากความยากเป้าหมาย แล้วสุ่มจากกลุ่มที่ใกล้ที่สุดก่อน
  const byDist = {};
  pool.forEach(q => {
    const d = Math.abs(effectiveDifficulty(q) - target);
    (byDist[d] ||= []).push(q);
  });

  const picked = [];
  const cats = new Set();
  for (const dist of Object.keys(byDist).map(Number).sort((a, b) => a - b)) {
    const bucket = shuffle(byDist[dist]);
    // รอบแรกพยายามให้หมวดไม่ซ้ำ เพื่อให้แมตช์หนึ่งครอบคลุมหลายเรื่อง
    for (const q of bucket) {
      if (picked.length >= n) break;
      if (!cats.has(q.category)) { picked.push(q); cats.add(q.category); }
    }
    for (const q of bucket) {
      if (picked.length >= n) break;
      if (!picked.includes(q)) picked.push(q);
    }
    if (picked.length >= n) break;
  }
  return shuffle(picked).slice(0, n);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* บันทึกสถิติคำถาม + เวลาตอบ (ใช้ป้อนระบบผี) */
function recordAnswer(q, correct, ms, mmr) {
  const all = db.qstats();
  const s = all[q.id] ||= { seenCorrect: 0, seenTotal: 0, times: [], reports: 0 };
  s.seenTotal++;
  if (correct) s.seenCorrect++;
  s.times.push({ ms, correct, mmr });
  if (s.times.length > 60) s.times = s.times.slice(-60);
  db.saveQstats(all);
}

function reportQuestion(qid) {
  const all = db.qstats();
  const s = all[qid] ||= { seenCorrect: 0, seenTotal: 0, times: [], reports: 0 };
  s.reports++;
  db.saveQstats(all);
  return s.reports;
}

/* ============ 04 · คู่แข่ง Ghost ============ */
const GHOST_NAMES = ["สมชายซ่าส์", "noobmaster", "ปลาทูทอด", "byte_lord", "เจ๊หมวย404",
  "kernelpanic", "หมีขาว", "ping9999", "ครูไอที", "sudohero", "แมวเหมียว",
  "null_ptr", "ลุงตุ๋ย", "ctrlz", "ข้าวมันไก่", "ยัยตัวร้าย", "root_kit",
  "น้องเมย์", "hex_ma", "พี่บอลไอที", "cache_miss", "ป้าแดง", "zerocool", "ตี๋น้อย"];

/* บอทถูกเก็บเป็นผู้เล่นจริงในฐานข้อมูล เพื่อให้ลีดเดอร์บอร์ดมีชีวิต
   ไม่มีใครล็อกอินเป็นบอทได้ เพราะ pinHash สุ่มและไม่มีใครรู้ */
async function seedBots() {
  const existing = await db.allPlayers();
  if (existing.some(p => p.isBot)) return;
  for (let i = 0; i < GHOST_NAMES.length; i++) {
    const name = GHOST_NAMES[i];
    if (existing.some(p => p.name === name)) continue;
    const mmr = 700 + Math.round(Math.random() * 1700);
    const games = 12 + Math.floor(Math.random() * 90);
    const wins = Math.round(games * (0.35 + Math.random() * 0.3));
    const streak = Math.random() < 0.1 ? 15 + Math.floor(Math.random() * 7)
                 : Math.random() < 0.35 ? 1 + Math.floor(Math.random() * 7) : 0;
    const p = newPlayer(name, name, crypto.randomUUID(), crypto.randomUUID().slice(0, 8));
    Object.assign(p, {
      isBot: true, mmr, wins, losses: games - wins, streak,
      bestStreak: Math.max(streak, 2 + Math.floor(Math.random() * 14)),
      totalAnswers: games * 5,
      totalAnswerMs: games * 5 * (2200 + Math.random() * 3000)
    });
    await db.savePlayer(p);
  }
}

/* จับคู่กับบอทที่ MMR ใกล้กันที่สุด ถ้าไม่มีค่อยสร้างผีชั่วคราว */
async function makeGhost(myMmr) {
  const bots = (await db.allPlayers()).filter(p => p.isBot);
  const near = bots.filter(b => Math.abs(b.mmr - myMmr) < 260);
  const pool = near.length ? near : bots;
  if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
  return {
    id: "p_ghost_" + Math.random().toString(36).slice(2, 6),
    name: "ghost", displayName: "ผีไร้ชื่อ",
    mmr: Math.max(200, Math.round(myMmr + (Math.random() * 400 - 200))),
    streak: 0, wins: 0, losses: 0, isGhost: true
  };
}

/* อัปเดตผลให้ฝั่งบอทด้วย บอร์ดจะได้ขยับจริงตามการเล่น */
async function applyOpponentResult(opp, oppWon, delta) {
  if (!opp || !opp.isBot) return;
  oppWon ? opp.wins++ : opp.losses++;
  opp.streak = oppWon ? opp.streak + 1 : 0;
  if (opp.streak > opp.bestStreak) opp.bestStreak = opp.streak;
  opp.mmr = Math.max(0, opp.mmr + delta);
  await db.savePlayer(opp);
}

/* หยิบเวลาตอบจริงของคนที่ MMR ใกล้กันมารีเพลย์ ถ้าไม่มีข้อมูลค่อยจำลอง */
function ghostAnswer(q, ghost) {
  const s = questionStats(q);
  const pool = (s.times || []).filter(t => Math.abs(t.mmr - ghost.mmr) < 200);
  let pick;
  if (pool.length) {
    pick = pool[Math.floor(Math.random() * pool.length)];
  } else {
    const skill = Math.max(0.25, Math.min(0.95, 0.35 + (ghost.mmr - 600) / 2600));
    const diff = effectiveDifficulty(q);
    pick = {
      ms: 1400 + diff * 350 + Math.random() * 2800,
      correct: Math.random() < skill - (diff - 3) * 0.07
    };
  }
  return {
    correct: pick.correct,
    ms: Math.min(LIMIT_MS, Math.round(pick.ms * (0.9 + Math.random() * 0.2)))
  };
}
