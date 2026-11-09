/* Player profile: XP/levels, shards (soft currency), skins, achievements,
 * best scores, run history and settings. Versioned save with migration. */
(function () {
  const OB = (window.OB = window.OB || {});
  const SAVE_KEY = 'orblings.save.v1';

  // -------------------------------------------------------------- achievements
  // test(run, profile) is evaluated live during a run and again at the end.
  const ACHIEVEMENTS = [
    { id: 'first_blood', name: 'First Bite', desc: 'Absorb your first rival', icon: '🍬', shards: 20, test: (r) => r.kills >= 1 },
    { id: 'hunter', name: 'Apex Hunter', desc: 'Defeat 5 rivals in one run', icon: '🦈', shards: 60, test: (r) => r.kills >= 5 },
    { id: 'big', name: 'Heavyweight', desc: 'Reach 400 power', icon: '💪', shards: 30, test: (r) => r.peakMass >= 400 },
    { id: 'titan', name: 'Titan', desc: 'Reach 1200 power', icon: '🪐', shards: 100, test: (r) => r.peakMass >= 1200 },
    { id: 'crown', name: 'Wear the Crown', desc: 'Become #1 in the arena', icon: '👑', shards: 80, test: (r) => r.peakRank === 1 },
    { id: 'survivor', name: 'Survivor', desc: 'Survive for 3 minutes', icon: '⏱️', shards: 40, test: (r) => r.time >= 180 },
    { id: 'sharpshooter', name: 'Moonslinger', desc: 'Land 20 moon hits in one run', icon: '🌙', shards: 40, test: (r) => r.moonHits >= 20 },
    { id: 'pulse_master', name: 'Pulse Master', desc: 'Use Pulse 100 times total', icon: '💥', shards: 40, test: (r, p) => p.stats.pulses + r.pulses >= 100 },
    { id: 'collector', name: 'Energy Hoarder', desc: 'Collect 10,000 energy total', icon: '✨', shards: 50, test: (r, p) => p.stats.energy + r.energy >= 10000 },
    { id: 'veteran', name: 'Veteran', desc: 'Play 15 rounds', icon: '🎖️', shards: 50, test: (r, p) => p.stats.games + (r.final ? 1 : 0) >= 15 },
    { id: 'score_1k', name: 'Four Digits', desc: 'Score 1,000 in one run', icon: '🔥', shards: 40, test: (r) => r.score >= 1000 },
    { id: 'score_5k', name: 'Legend', desc: 'Score 5,000 in one run', icon: '🌟', shards: 150, test: (r) => r.score >= 5000 },
  ];

  OB.Achievements = {
    LIST: ACHIEVEMENTS,
    get: (id) => ACHIEVEMENTS.find((a) => a.id === id),
  };

  // -------------------------------------------------------------- levels
  const xpToNext = (level) => 100 + (level - 1) * 65;
  function levelInfo(totalXP) {
    let level = 1, xp = Math.max(0, Math.floor(totalXP));
    while (xp >= xpToNext(level)) { xp -= xpToNext(level); level++; }
    return { level, into: xp, need: xpToNext(level), frac: xp / xpToNext(level) };
  }
  function runXP(r) {
    return Math.floor(r.score * 0.5 + r.kills * 20 + r.time * 0.6 + r.moonHits * 2);
  }
  function runShards(r) {
    return Math.floor(r.score / 60 + r.kills * 2 + (r.rank === 1 ? 10 : 0));
  }

  function defaults() {
    return {
      v: 1,
      name: '',
      totalXP: 0,
      shards: 0,
      bestScore: 0,
      bestRank: 0,
      selectedSkin: 'ember',
      ownedSkins: [], // shards/premium purchases
      achievements: {},
      runs: [], // top runs {score, name, date, kills, time}
      stats: { games: 0, kills: 0, energy: 0, pulses: 0, timePlayed: 0, moonHits: 0 },
      settings: { sound: true, music: true, haptics: true, controls: 'joystick', leftHanded: false, quality: 'auto' },
      hintSeen: false,
    };
  }

  function migrate(d) {
    const base = defaults();
    if (!d || typeof d !== 'object') return base;
    const out = Object.assign(base, d);
    out.stats = Object.assign(defaults().stats, d.stats || {});
    out.settings = Object.assign(defaults().settings, d.settings || {});
    out.achievements = d.achievements || {};
    out.ownedSkins = Array.isArray(d.ownedSkins) ? d.ownedSkins : [];
    out.runs = Array.isArray(d.runs) ? d.runs : [];
    out.v = 1;
    return out;
  }

  const Profile = {
    data: null,
    levelInfo,
    runXP,
    runShards,
    xpToNext,

    load() {
      this.data = migrate(OB.Storage.load(SAVE_KEY, null));
      if (!this.isSkinUnlocked(this.data.selectedSkin)) this.data.selectedSkin = 'ember';
      return this.data;
    },
    save() {
      OB.Storage.save(SAVE_KEY, this.data);
    },
    reset() {
      const keepSettings = this.data.settings;
      this.data = defaults();
      this.data.settings = keepSettings;
      this.save();
    },

    get level() {
      return levelInfo(this.data.totalXP).level;
    },
    get name() {
      return this.data.name;
    },
    setName(n) {
      this.data.name = String(n || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 14);
      this.save();
    },

    // ---------------- skins
    isSkinUnlocked(id) {
      const skin = OB.Cosmetics.get(id);
      if (!skin || skin.id !== id) return false;
      const u = skin.unlock;
      switch (u.type) {
        case 'default': return true;
        case 'level': return this.level >= u.value;
        case 'achievement': return !!this.data.achievements[u.value];
        case 'shards':
        case 'premium': return this.data.ownedSkins.includes(id);
      }
      return false;
    },
    selectSkin(id) {
      if (!this.isSkinUnlocked(id)) return false;
      this.data.selectedSkin = id;
      this.save();
      return true;
    },
    buySkinWithShards(id) {
      const skin = OB.Cosmetics.get(id);
      if (skin.unlock.type !== 'shards' || this.isSkinUnlocked(id)) return false;
      if (!OB.Monetization.wallet.spend(skin.unlock.value)) return false;
      this.data.ownedSkins.push(id);
      this.save();
      return true;
    },
    grantSkin(id) {
      if (!this.data.ownedSkins.includes(id)) this.data.ownedSkins.push(id);
      this.save();
    },
    unlockedSkinIds() {
      return OB.Cosmetics.SKINS.filter((s) => this.isSkinUnlocked(s.id)).map((s) => s.id);
    },

    // ---------------- achievements
    /** checks achievements against a (live) run; returns newly unlocked ones */
    checkAchievements(run) {
      const out = [];
      for (const a of ACHIEVEMENTS) {
        if (this.data.achievements[a.id]) continue;
        let ok = false;
        try { ok = a.test(run, this.data); } catch (e) { ok = false; }
        if (ok) {
          this.data.achievements[a.id] = Date.now();
          this.data.shards += a.shards;
          out.push(a);
        }
      }
      if (out.length) this.save();
      return out;
    },

    /** commits a finished run; returns a summary for the game-over screen */
    recordRun(run) {
      const d = this.data;
      const before = levelInfo(d.totalXP);
      const skinsBefore = new Set(this.unlockedSkinIds());
      run.final = true;
      const newAch = this.checkAchievements(run);

      const xp = runXP(run);
      const shards = runShards(run);
      d.totalXP += xp;
      d.shards += shards;
      d.stats.games++;
      d.stats.kills += run.kills;
      d.stats.energy += run.energy;
      d.stats.pulses += run.pulses;
      d.stats.moonHits += run.moonHits;
      d.stats.timePlayed += run.time;
      const newBest = run.score > d.bestScore;
      if (newBest) d.bestScore = Math.floor(run.score);
      if (run.peakRank && (!d.bestRank || run.peakRank < d.bestRank)) d.bestRank = run.peakRank;

      d.runs.push({ score: Math.floor(run.score), name: d.name || 'You', date: Date.now(), kills: run.kills, time: Math.floor(run.time) });
      d.runs.sort((a, b) => b.score - a.score);
      d.runs = d.runs.slice(0, 15);

      const after = levelInfo(d.totalXP);
      const unlocked = this.unlockedSkinIds().filter((id) => !skinsBefore.has(id)).map((id) => OB.Cosmetics.get(id));
      this.save();
      return {
        xp, shards, newBest,
        before, after,
        levelsGained: after.level - before.level,
        achievements: newAch,
        unlockedSkins: unlocked,
      };
    },
  };

  OB.Profile = Profile;
})();
