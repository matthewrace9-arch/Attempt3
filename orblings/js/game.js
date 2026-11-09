/* Game engine: main loop, state machine, camera, and the glue that turns
 * simulation events into juice (fx/audio/haptics/UI). */
(function () {
  const OB = (window.OB = window.OB || {});
  const U = OB.U;
  const C = OB.CONFIG;

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.renderer = new OB.Renderer(canvas);
      this.fx = new OB.Effects();
      this.input = new OB.Input(canvas);
      this.cam = { x: 0, y: 0, zoom: 0.6 };
      this.state = 'menu'; // menu | playing | paused | dying | over
      this.session = new OB.Net.LocalSession({ attract: true });
      this.player = null;
      this.run = null;
      this.timeScale = 1;
      this.last = performance.now();
      this.dprCap = 2;
      this.perf = { sum: 0, n: 0, downgraded: 0 };
      this.attract = { target: null, t: 0 };

      this.input.onFirstMove = () => {
        if (this.state === 'playing' && this.hintTimer > 2) this.hintTimer = Math.min(this.hintTimer, 2.5);
      };

      const onResize = () => this.resize();
      window.addEventListener('resize', onResize);
      window.addEventListener('orientationchange', () => setTimeout(onResize, 200));
      if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          if (this.state === 'playing') this.pause();
          OB.Audio.suspend();
        } else {
          OB.Audio.resume();
          this.last = performance.now();
        }
      });

      this.applySettings();
      this.resize();
      this.pickAttractTarget();
      requestAnimationFrame((t) => this.frame(t));
    }

    // ------------------------------------------------------------ settings
    applySettings() {
      const s = OB.Profile.data.settings;
      OB.Audio.setSfx(s.sound);
      OB.Audio.setMusic(s.music);
      OB.Haptics.enabled = s.haptics;
      this.input.mode = s.controls;
      document.body.classList.toggle('left-handed', !!s.leftHanded);
      const devDpr = window.devicePixelRatio || 1;
      if (s.quality === 'low') { this.dprCap = 1; this.fx.scale = 0.5; }
      else if (s.quality === 'high') { this.dprCap = Math.min(devDpr, 3); this.fx.scale = 1; }
      else { this.dprCap = Math.min(devDpr, 2); this.fx.scale = 1; this.perf.downgraded = 0; }
      this.resize();
    }

    resize() {
      const vv = window.visualViewport;
      const w = Math.round(vv ? vv.width : window.innerWidth);
      const h = Math.round(vv ? vv.height : window.innerHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
      if (w === this.renderer.w && h === this.renderer.h && dpr === this.renderer.dpr) return;
      this.renderer.resize(w, h, dpr);
    }

    /** auto quality: drop resolution if the device can't keep up */
    trackPerf(dt) {
      if (OB.Profile.data.settings.quality !== 'auto' || this.state !== 'playing') return;
      this.perf.sum += dt; this.perf.n++;
      if (this.perf.n >= 120) {
        const avg = this.perf.sum / this.perf.n;
        this.perf.sum = 0; this.perf.n = 0;
        if (avg > 0.024 && this.dprCap > 1) {
          this.dprCap = Math.max(1, this.dprCap - 0.5);
          this.fx.scale = Math.max(0.5, this.fx.scale - 0.25);
          this.perf.downgraded++;
          this.resize();
        }
      }
    }

    // ------------------------------------------------------------ states
    startRun() {
      OB.Audio.unlock();
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) OB.UI.toggleFullscreen(true);
      const P = OB.Profile;
      const name = P.name || 'Guest ' + U.randInt(100, 999);
      this.session = new OB.Net.LocalSession();
      this.player = this.session.join(name, OB.Cosmetics.get(P.data.selectedSkin));
      this.run = {
        score: 0, kills: 0, time: 0, peakMass: C.START_MASS, rank: 99, peakRank: 99,
        moonHits: 0, pulses: 0, energy: 0, liveAch: [],
      };
      this.combo = 0; this.lastPickupT = -1; this.pickupAcc = 0; this.pickupTimer = 0;
      this.achTimer = 0;
      this.lastMoons = 1;
      this.wasFirst = false;
      this.liveLevel = P.levelInfo(P.data.totalXP).level;
      this.killer = null;
      this.timeScale = 1;
      this.fx.clear();
      this.input.reset();
      this.input.enabled = true;
      this.cam.x = this.player.x; this.cam.y = this.player.y;
      this.cam.zoom = this.targetZoom(this.player) * 1.4;
      OB.UI.showHUD();
      const showHint = !P.data.hintSeen || P.data.stats.games < 2;
      OB.UI.showHint(showHint);
      this.hintTimer = showHint ? 9 : 0;
      OB.Audio.intensity = 0.7;
      this.state = 'playing';
      this.fx.ring(this.player.x, this.player.y, '#ffffff', 10, 120, 0.6, 6);
    }

    pause() {
      if (this.state !== 'playing') return;
      this.state = 'paused';
      this.input.release();
      OB.UI.pauseStats(this.player, this.run.time);
      OB.UI.showOverlay('pause');
      OB.Audio.intensity = 0.2;
    }

    resume() {
      if (this.state !== 'paused') return;
      OB.UI.hideOverlays();
      OB.UI.closeAllPanels();
      this.state = 'playing';
      this.last = performance.now();
      OB.Audio.intensity = 0.7;
    }

    toMenu() {
      this.state = 'menu';
      this.input.enabled = false;
      this.player = null;
      this.session = new OB.Net.LocalSession({ attract: true });
      this.fx.clear();
      this.pickAttractTarget();
      OB.UI.showMenu();
      OB.Audio.intensity = 0;
    }

    playerDied(e) {
      this.state = 'dying';
      this.deathT = 0;
      this.timeScale = 0.25;
      this.killer = e.killer;
      this.killHow = e.how;
      this.input.enabled = false;
      this.input.release();
      const p = this.player;
      this.fx.burst(p.x, p.y, p.skin.c1, 40, 520, 9, 1.0);
      this.fx.ring(p.x, p.y, p.skin.c2, p.r, p.r * 4, 0.8, 12);
      this.fx.shake(0.85);
      this.fx.hurt(1);
      OB.Audio.death();
      OB.Haptics.death();
      OB.UI.showHint(false);
      this.run.rank = this.session.world.rankOf(p);
    }

    finishRun(how) {
      const run = this.run;
      const p = this.player;
      run.score = Math.floor(p.score);
      run.kills = p.kills;
      run.moonHits = p.moonHits;
      run.pulses = p.pulses;
      run.energy = Math.floor(p.energy);
      if (how === 'quit') run.rank = this.session.world.rankOf(p);
      run.peakRank = Math.min(run.peakRank, run.rank);
      const summary = OB.Profile.recordRun(run);
      OB.Profile.data.hintSeen = true;
      OB.Profile.save();
      summary.achievements = run.liveAch.concat(summary.achievements);
      this.state = 'over';
      this.input.enabled = false;
      OB.Audio.intensity = 0.2;
      const killerName = this.killer ? this.killer.name : null;
      OB.UI.showGameOver(run, summary, killerName, how === 'quit' ? 'quit' : this.killHow);
      OB.UI.refreshMenu();
    }

    quit() {
      if (this.state !== 'paused') return;
      OB.UI.closeAllPanels();
      this.finishRun('quit');
    }

    // ------------------------------------------------------------ camera
    targetZoom(o) {
      const minDim = Math.min(this.renderer.w, this.renderer.h);
      const r = o ? o.r : 30;
      let z = Math.max(minDim, 340) / (380 + r * 4.2);
      if (minDim > 600) z *= 0.62; // tablets/desktop see more of the arena
      return U.clamp(z, 0.2, 1.1);
    }

    pickAttractTarget() {
      const list = this.session.world.orblings.filter((o) => o.alive);
      list.sort((a, b) => b.mass - a.mass);
      this.attract.target = list[Math.floor(Math.random() * Math.min(5, list.length))] || null;
      this.attract.t = U.rand(8, 14);
    }

    updateCamera(dt) {
      let target = null, zoom = this.cam.zoom;
      if (this.state === 'menu') {
        this.attract.t -= dt;
        if (!this.attract.target || !this.attract.target.alive || this.attract.t <= 0) this.pickAttractTarget();
        target = this.attract.target;
        zoom = this.targetZoom(target) * 0.75;
      } else if (this.state === 'dying' || this.state === 'over') {
        target = this.killer && this.killer.alive ? this.killer : null;
        if (target) zoom = this.targetZoom(target) * 0.9;
      } else if (this.player) {
        target = this.player;
        zoom = this.targetZoom(this.player);
      }
      if (target) {
        const k = Math.min(1, dt * (this.state === 'playing' ? 9 : 2.5));
        this.cam.x += (target.x - this.cam.x) * k;
        this.cam.y += (target.y - this.cam.y) * k;
      }
      this.cam.zoom += (zoom - this.cam.zoom) * Math.min(1, dt * 2.5);
    }

    // ------------------------------------------------------------ events
    onScreen(x, y, pad = 100) {
      const z = this.cam.zoom;
      return Math.abs(x - this.cam.x) < this.renderer.w / 2 / z + pad && Math.abs(y - this.cam.y) < this.renderer.h / 2 / z + pad;
    }

    handleEvents(events) {
      const P = this.player;
      const fx = this.fx;
      const A = OB.Audio, H = OB.Haptics;
      const live = this.state === 'playing';
      for (const e of events) {
        switch (e.type) {
          case 'pickup':
            if (e.o === P && live) {
              const now = this.run.time;
              this.combo = now - this.lastPickupT < 0.45 ? this.combo + 1 : 0;
              this.lastPickupT = now;
              this.pickupAcc += e.mass;
              if (e.kind === 'g') {
                fx.text(e.x, e.y - 10, '+' + e.mass, '#ffe14d', 22);
                fx.burst(e.x, e.y, '#ffe14d', 8, 200, 5, 0.4);
                H.tick();
              }
              A.pickup(this.combo, e.kind === 'g');
            }
            break;

          case 'eat': {
            const v = e.victim;
            if (this.onScreen(e.x, e.y)) {
              fx.burst(e.x, e.y, v.skin.c1, 26, 420, 7, 0.7);
              fx.ring(e.x, e.y, v.skin.c1, v.r, v.r * 3 + 40, 0.5, 8);
            }
            if (e.eater === P && live) {
              fx.text(P.x, P.y - P.r - 30, '+' + Math.floor(e.gained), '#7dffb0', 34);
              fx.text(P.x, P.y + P.r + 30, 'ABSORBED ' + v.name.toUpperCase(), '#ffffff', 18, { life: 1.3, vy: -30 });
              fx.shake(0.35);
              A.eat();
              H.medium();
            }
            break;
          }

          case 'moonHit': {
            if (!this.onScreen(e.x, e.y)) break;
            fx.sparks(e.x, e.y, '#ffffff', 10, 520);
            fx.burst(e.x, e.y, e.target.skin.c1, 6, 260, 5, 0.4);
            fx.text(e.target.x, e.target.y - e.target.r - 6, '-' + Math.round(e.dmg), e.target === P ? '#ff5c7c' : '#ffb0c0', e.pulsing ? 26 : 20);
            if (e.attacker === P && live) {
              A.hitDealt();
              H.light();
              fx.shake(e.pulsing ? 0.2 : 0.1);
            } else if (e.target === P && live) {
              A.hurt();
              H.medium();
              fx.shake(0.4);
              fx.hurt(0.7);
            }
            break;
          }

          case 'clash':
            if (!this.onScreen(e.x, e.y)) break;
            fx.sparks(e.x, e.y, '#bdf6ff', 12, 600);
            fx.ring(e.x, e.y, '#bdf6ff', 4, 40, 0.25, 4);
            if ((e.a === P || e.b === P) && live) { A.clash(); H.tick(); fx.shake(0.08); }
            break;

          case 'pulse':
            if (this.onScreen(e.x, e.y, 300)) {
              fx.ring(e.x, e.y, e.o.skin.c2, e.o.r, OB.Physics.pulseReach(e.o) + 50, 0.45, 12);
              fx.ring(e.x, e.y, '#ffffff', e.o.r, OB.Physics.pulseReach(e.o) * 0.7, 0.3, 4);
            }
            if (e.o === P && live) { A.pulse(); H.medium(); fx.shake(0.15); }
            break;

          case 'death':
            if (e.how === 'moon' && this.onScreen(e.x, e.y)) {
              fx.burst(e.x, e.y, e.victim.skin.c1, 22, 380, 7, 0.6);
              fx.ring(e.x, e.y, e.victim.skin.c2, e.victim.r, e.victim.r * 3, 0.5, 6);
            }
            if (e.victim === P && live) {
              this.playerDied(e);
            } else if (e.killer === P && live && e.how === 'moon') {
              fx.text(P.x, P.y + P.r + 30, 'SHATTERED ' + e.victim.name.toUpperCase(), '#ffffff', 18, { life: 1.3, vy: -30 });
              fx.text(e.x, e.y, '+' + C.KILL_BONUS, '#7dffb0', 30);
              fx.shake(0.3);
              A.eat();
              H.medium();
            }
            break;
        }
      }
    }

    /** per-frame run bookkeeping: pickups text, moons, rank, live XP/achievements */
    updateRun(dt) {
      const P = this.player, run = this.run, fx = this.fx, world = this.session.world;
      run.time += dt;
      run.score = P.score;
      run.kills = P.kills;
      run.moonHits = P.moonHits;
      run.pulses = P.pulses;
      run.energy = P.energy;
      run.peakMass = Math.max(run.peakMass, P.mass);
      run.rank = world.rankOf(P);
      if (run.time > 1) run.peakRank = Math.min(run.peakRank, run.rank);

      // aggregated "+N" energy numbers
      this.pickupTimer -= dt;
      if (this.pickupTimer <= 0 && this.pickupAcc > 0) {
        this.pickupTimer = 0.28;
        const n = Math.round(this.pickupAcc);
        if (n > 0) fx.text(P.x + U.rand(-P.r, P.r) * 0.5, P.y - P.r - 14, '+' + n, this.combo > 8 ? '#ffe14d' : '#e8fffa', 15 + Math.min(10, n));
        this.pickupAcc = 0;
      }

      // new moon earned
      const moons = P.moons.length;
      if (moons > this.lastMoons) {
        fx.text(P.x, P.y - P.r - 40, '+1 MOON', '#bdf6ff', 22, { life: 1.2 });
        fx.ring(P.x, P.y, '#bdf6ff', P.r, OB.Physics.orbitDist(P) + 20, 0.5, 5);
        OB.Audio.moonGain();
        OB.Haptics.light();
      }
      this.lastMoons = moons;

      // crown
      if (run.rank === 1 && !this.wasFirst && world.orblings.length > 3 && run.time > 1) {
        this.wasFirst = true;
        OB.UI.toast('👑', "You're #1!", 'Everyone is coming for you now.');
        OB.Audio.achievement();
        OB.Haptics.success();
      } else if (run.rank > 2) {
        this.wasFirst = false;
      }

      // live XP / level-ups and achievements (throttled)
      this.achTimer -= dt;
      if (this.achTimer <= 0) {
        this.achTimer = 0.5;
        const unlocked = OB.Profile.checkAchievements(run);
        for (const a of unlocked) {
          run.liveAch.push(a);
          OB.UI.toast(a.icon, 'Trophy: ' + a.name, a.desc + ' · +' + a.shards + ' shards');
          OB.Audio.achievement();
          OB.Haptics.success();
        }
        const li = this.liveLevelInfo();
        if (li.level > this.liveLevel) {
          this.liveLevel = li.level;
          OB.UI.toast('⬆️', 'Level ' + li.level + '!', 'Keep going for new skins', 'level');
          OB.Audio.levelUp();
          fx.text(P.x, P.y - P.r - 60, 'LEVEL UP!', '#7dffb0', 26, { life: 1.4 });
        }
      }

      if (this.hintTimer > 0) {
        this.hintTimer -= dt;
        if (this.hintTimer <= 0) OB.UI.showHint(false);
      }
    }

    liveLevelInfo() {
      return OB.Profile.levelInfo(OB.Profile.data.totalXP + (this.run ? OB.Profile.runXP(this.run) : 0));
    }

    // ------------------------------------------------------------ loop
    frame(now) {
      requestAnimationFrame((t) => this.frame(t));
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (!(dt > 0)) dt = 1 / 60;
      dt = Math.min(dt, 0.05);
      this.trackPerf(dt);

      const r = this.renderer;
      if (this.state === 'playing') {
        const P = this.player;
        const sx = (P.x - this.cam.x) * this.cam.zoom + r.w / 2;
        const sy = (P.y - this.cam.y) * this.cam.zoom + r.h / 2;
        const intent = this.input.getIntent(sx, sy);
        intent.ability = this.input.consumeAbility();
        this.session.sendInput(intent);
        this.session.update(dt);
        this.handleEvents(this.session.drainEvents());
        if (this.state === 'playing') this.updateRun(dt);
      } else if (this.state === 'dying') {
        this.deathT += dt;
        this.timeScale = Math.min(1, 0.25 + this.deathT * 0.6);
        this.session.update(dt * this.timeScale);
        this.handleEvents(this.session.drainEvents());
        if (this.deathT > 1.6) this.finishRun('dead');
      } else if (this.state === 'menu' || this.state === 'over') {
        this.session.update(dt);
        this.handleEvents(this.session.drainEvents());
      }

      this.fx.update(this.state === 'paused' ? 0 : dt);
      this.updateCamera(dt);
      r.render({
        world: this.session.world,
        cam: this.cam,
        fx: this.fx,
        input: this.input,
        player: this.player,
        dt: this.state === 'paused' ? 0 : dt,
        showStick: this.state === 'playing',
        hideNames: this.state === 'menu',
      });

      if (this.state === 'playing' || this.state === 'paused') {
        OB.UI.updateHUD({ player: this.player, world: this.session.world, levelInfo: this.liveLevelInfo() });
      } else if (this.state === 'menu' && !OB.UI.panelOpen) {
        OB.UI.drawPreview(now / 1000);
      }
    }
  }

  OB.Game = Game;
})();
