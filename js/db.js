/* ชั้นข้อมูลชั้นเดียวของทั้งเกม
   ทุกการอ่าน/เขียนต้องผ่าน db.* เท่านั้น
   วันที่ย้ายขึ้น Firebase ให้แก้เฉพาะไฟล์นี้ ไม่ต้องแตะเกม */
const db = (() => {
  const K = {
    players: "td_players",
    session: "td_session",
    matches: "td_matches",
    qstats:  "td_qstats",
    season:  "td_season"
  };

  const read  = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
  const write = (k, v)  => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn("เขียนข้อมูลไม่สำเร็จ", e); } };

  const allPlayers = () => read(K.players, {});

  return {
    /* ---- player ---- */
    async getPlayer(name)      { return allPlayers()[name] || null; },
    async getPlayerById(id)    { return Object.values(allPlayers()).find(p => p.id === id) || null; },
    async savePlayer(p)        { const all = allPlayers(); all[p.name] = p; write(K.players, all); return p; },
    async allPlayers()         { return Object.values(allPlayers()); },

    /* ---- leaderboard ---- */
    async topPlayers(field = "mmr", limit = 100) {
      return Object.values(allPlayers())
        .filter(p => (p.wins + p.losses) > 0)
        .sort((a, b) => (b[field] || 0) - (a[field] || 0))
        .slice(0, limit);
    },

    /* ---- session ---- */
    getSession()   { const s = read(K.session, null); return (s && s.exp > Date.now()) ? s : null; },
    setSession(id) { write(K.session, { id, token: crypto.randomUUID(), exp: Date.now() + 30 * 86400000 }); },
    clearSession() { localStorage.removeItem(K.session); },

    /* ---- match history ---- */
    async saveMatch(m) {
      const list = read(K.matches, []);
      list.unshift(m);
      write(K.matches, list.slice(0, 300));
    },
    async matchesOf(playerId, limit = 20) {
      return read(K.matches, []).filter(m => m.players.includes(playerId)).slice(0, limit);
    },

    /* ---- question stats (seenCorrect / seenTotal / times / reports) ---- */
    qstats()            { return read(K.qstats, {}); },
    saveQstats(stats)   { write(K.qstats, stats); },

    /* ---- season ---- */
    season() {
      let s = read(K.season, null);
      if (!s || s.endsAt < Date.now()) {
        s = { no: (s ? s.no + 1 : 1), startedAt: Date.now(), endsAt: Date.now() + 30 * 86400000 };
        write(K.season, s);
      }
      return s;
    },

    /* ---- danger zone ---- */
    wipeAll() { Object.values(K).forEach(k => localStorage.removeItem(k)); }
  };
})();
