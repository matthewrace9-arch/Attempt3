/* The authoritative simulation. Driven only by per-orbling `intent`
 * ({mx, my, ability}) so the same code can run on a server later.
 * Emits events (world.events) that the presentation layer consumes. */
(function () {
  const OB = (window.OB = window.OB || {});
  const C = OB.CONFIG;
  const U = OB.U;
  const Physics = OB.Physics;
  const Collision = OB.Collision;

  class World {
    constructor(opts = {}) {
      this.R = C.ARENA_RADIUS;
      this.time = 0;
      this.orblings = [];
      this.pellets = [];
      this.events = [];
      this.nextId = 1;
      this.grid = new Collision.SpatialGrid(this.R, C.GRID_CELL);
      this.respawnQueue = [];
      this.attract = !!opts.attract;
      this.usedNames = new Set();

      for (let i = 0; i < C.PELLET_TARGET; i++) this.spawnRandomPellet();
      this.populateBots();
    }

    emit(type, data) {
      data.type = type;
      this.events.push(data);
    }
    drainEvents() {
      const e = this.events;
      this.events = [];
      return e;
    }

    /** 0..1 how far into the difficulty ramp we are */
    get ramp() {
      return Math.min(1, this.time / C.DIFFICULTY_RAMP_SECONDS);
    }
    get difficulty() {
      return 1 + this.ramp * 0.8;
    }

    // ----------------------------------------------------------- spawning
    spawnRandomPellet() {
      const p = U.randInDisk(this.R - 30);
      const gold = Math.random() < C.PELLET_GOLD_CHANCE;
      this.pellets.push(
        OB.makePellet(p.x, p.y, gold ? C.PELLET_GOLD_MASS : C.PELLET_MASS, gold ? 'g' : 'n', gold ? '#ffe14d' : U.pick(C.PELLET_COLORS))
      );
    }

    spill(x, y, mass, color, count, fromX, fromY, lockId) {
      count = Math.max(1, Math.floor(count));
      const each = mass / count;
      if (each <= 0) return;
      for (let i = 0; i < count; i++) {
        let a = Math.random() * U.TAU;
        if (fromX !== undefined) {
          a = Math.atan2(y - fromY, x - fromX) + U.rand(-1.1, 1.1);
        }
        const sp = U.rand(160, 380);
        const p = OB.makePellet(x, y, each, 's', color, Math.cos(a) * sp, Math.sin(a) * sp);
        p.lockId = lockId || 0;
        p.lockT = 0.7;
        this.pellets.push(p);
      }
    }

    findSpawnPoint(mass) {
      let best = null, bestScore = -Infinity;
      for (let t = 0; t < 24; t++) {
        const p = U.randInDisk(this.R * 0.85);
        let minD = Infinity;
        for (const o of this.orblings) {
          if (!o.alive) continue;
          let d = Math.sqrt(U.dist2(p.x, p.y, o.x, o.y)) - o.r;
          if (o.mass > mass) d *= 0.5; // bigger orblings count as "closer"
          if (d < minD) minD = d;
        }
        // prefer open space, but not hugging the arena wall
        const score = Math.min(minD, 1200) - Math.max(0, Math.hypot(p.x, p.y) - this.R * 0.6) * 0.8;
        if (score > bestScore) { bestScore = score; best = p; }
      }
      return best || { x: 0, y: 0 };
    }

    pickBotName() {
      const names = OB.Cosmetics.BOT_NAMES;
      for (let i = 0; i < 12; i++) {
        const n = U.pick(names);
        if (!this.usedNames.has(n)) { this.usedNames.add(n); return n; }
      }
      return U.pick(names) + U.randInt(2, 99);
    }

    addOrbling(opts) {
      const o = new OB.Orbling(this.nextId++, opts);
      const p = opts.x !== undefined ? opts : this.findSpawnPoint(o.mass);
      o.x = p.x; o.y = p.y;
      o.spawnTime = this.time;
      this.orblings.push(o);
      return o;
    }

    addPlayer(name, skin) {
      const o = this.addOrbling({ name, skin, isPlayer: true, mass: C.START_MASS });
      this.emit('spawn', { o });
      return o;
    }

    spawnBot(mass) {
      if (mass === undefined) {
        // later in a run, rivals arrive bigger
        const r = this.ramp;
        mass = C.START_MASS + Math.pow(Math.random(), 2) * (40 + r * 260);
      }
      const o = this.addOrbling({
        name: this.pickBotName(),
        skin: OB.Cosmetics.randomBotSkin(),
        mass,
        shield: 1.2,
      });
      o.ai = new OB.BotBrain(o, OB.AI.randomPersonality());
      o.score = Math.floor(mass * 0.6);
      return o;
    }

    populateBots() {
      // a spread of sizes so the arena feels lived-in from the start
      const sizes = [];
      for (let i = 0; i < C.BOT_START; i++) {
        if (i < 6) sizes.push(U.rand(20, 40));
        else if (i < 10) sizes.push(U.rand(45, 100));
        else sizes.push(U.rand(110, 220));
      }
      for (const m of sizes) {
        const b = this.spawnBot(m);
        b.shield = 0;
        b.dispR = b.r;
        // stagger moons so bots don't all start empty
        Physics.updateMoons(b, 0);
        for (const moon of b.moons) { moon.alive = true; moon.pop = 0; }
      }
    }

    get botTarget() {
      return Math.min(C.BOT_MAX, C.BOT_START + Math.floor(this.time / 22));
    }

    // ----------------------------------------------------------- combat
    absorb(eater, victim) {
      if (!victim.alive || !eater.alive) return;
      const gained = victim.mass * C.EAT_GAIN;
      eater.mass += gained;
      eater.score += Math.floor(gained) + C.KILL_BONUS;
      eater.kills++;
      eater.squash = 0.32;
      this.emit('eat', { eater, victim, x: victim.x, y: victim.y, gained });
      this.kill(victim, eater, 'eat');
    }

    moonStrike(attacker, moon, target) {
      const pulsing = attacker.pulseT > 0;
      let dmg = 3 + attacker.mass * 0.045 + (pulsing ? 4 : 0);
      dmg = Math.min(dmg, target.mass * 0.22 + 2);
      moon.alive = false;
      moon.t = C.MOON.respawn;
      target.mass -= dmg;
      target.hitCD = C.MOON.hitCooldown;
      target.hitFlash = 0.25;
      target.recentHit = 2.5;
      const dx = target.x - moon.x, dy = target.y - moon.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const kb = 240 + (pulsing ? 160 : 0);
      target.kx += (dx / d) * kb;
      target.ky += (dy / d) * kb;
      attacker.moonHits++;
      attacker.score += Math.round(dmg);

      this.emit('moonHit', { attacker, target, x: moon.x, y: moon.y, dmg, pulsing });

      if (target.mass < C.MIN_MASS) {
        attacker.kills++;
        attacker.score += C.KILL_BONUS;
        this.kill(target, attacker, 'moon');
      } else {
        // spilled energy is up for grabs (but not by the victim for a moment)
        this.spill(target.x, target.y, dmg * 0.85, target.skin.c1, U.clamp(Math.round(dmg / 2.5), 2, 10), moon.x, moon.y, target.id);
      }
    }

    kill(victim, killer, how) {
      if (!victim.alive) return;
      victim.alive = false;
      if (how !== 'eat') {
        this.spill(victim.x, victim.y, Math.max(victim.mass, 6) * 0.9, victim.skin.c1, U.clamp(Math.round(victim.mass / 4), 4, 16));
      }
      this.emit('death', { victim, killer, how, x: victim.x, y: victim.y });
      if (!victim.isPlayer) {
        this.usedNames.delete(victim.name);
        this.respawnQueue.push(U.rand(C.BOT_RESPAWN[0], C.BOT_RESPAWN[1]));
      }
    }

    // ----------------------------------------------------------- step
    step(dt) {
      this.time += dt;

      for (const o of this.orblings) {
        if (o.alive && o.ai) o.ai.update(dt, this);
      }
      for (const o of this.orblings) {
        if (o.alive) Physics.updateOrbling(o, dt, this);
      }

      // pellets: spilled ones fly then settle
      const pellets = this.pellets;
      const damp = Math.pow(0.02, dt);
      const R2 = (this.R - 10) * (this.R - 10);
      for (let i = 0; i < pellets.length; i++) {
        const p = pellets[i];
        if (p.lockT > 0) p.lockT -= dt;
        if (p.vx !== 0 || p.vy !== 0) {
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.vx *= damp; p.vy *= damp;
          if (Math.abs(p.vx) + Math.abs(p.vy) < 2) { p.vx = 0; p.vy = 0; }
          if (p.x * p.x + p.y * p.y > R2) {
            const d = Math.sqrt(p.x * p.x + p.y * p.y);
            p.x *= (this.R - 12) / d; p.y *= (this.R - 12) / d;
            p.vx = 0; p.vy = 0;
          }
        }
      }

      this.grid.clear();
      for (let i = 0; i < pellets.length; i++) this.grid.insert(pellets[i]);

      Collision.pickups(this, dt);
      Collision.moons(this);
      Collision.bodies(this);

      // compact pellets & orblings
      let w = 0;
      for (let i = 0; i < pellets.length; i++) {
        if (!pellets[i].dead) pellets[w++] = pellets[i];
      }
      pellets.length = w;
      this.orblings = this.orblings.filter((o) => o.alive);

      // regrow ambient energy
      const normalCount = this.pellets.length;
      let deficit = Math.min(C.PELLET_REGEN_PER_STEP, C.PELLET_TARGET - normalCount);
      while (deficit-- > 0) this.spawnRandomPellet();
      // too many spilled pellets lying around? trim the oldest spills
      if (this.pellets.length > C.PELLET_TARGET * 1.6) {
        this.pellets.splice(0, this.pellets.length - Math.floor(C.PELLET_TARGET * 1.6));
      }

      // bot population management
      for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
        this.respawnQueue[i] -= dt;
        if (this.respawnQueue[i] <= 0) {
          this.respawnQueue.splice(i, 1);
          if (this.botCount() < this.botTarget) this.spawnBot();
        }
      }
      if (this.botCount() + this.respawnQueue.length < this.botTarget) {
        this.respawnQueue.push(U.rand(0.5, 2));
      }
    }

    botCount() {
      let n = 0;
      for (const o of this.orblings) if (o.alive && !o.isPlayer) n++;
      return n;
    }

    leaderboard() {
      return this.orblings.filter((o) => o.alive).sort((a, b) => b.mass - a.mass);
    }

    rankOf(o) {
      let rank = 1;
      for (const e of this.orblings) if (e.alive && e !== o && e.mass > o.mass) rank++;
      return rank;
    }

    /** Best food target for an AI within range (value per distance). */
    findFood(o, range, spilledBonus) {
      let best = null, bestScore = 0, checked = 0;
      this.grid.query(o.x, o.y, range, (p) => {
        if (p.dead || (p.lockT > 0 && p.lockId === o.id)) return;
        const d = Math.sqrt(U.dist2(o.x, o.y, p.x, p.y));
        if (d > range) return;
        const value = p.mass * (p.kind === 's' ? spilledBonus : p.kind === 'g' ? 1.5 : 1);
        const s = value / (d + 60);
        if (s > bestScore) { bestScore = s; best = p; }
        if (++checked > 120) return false;
      });
      return best;
    }
  }

  OB.World = World;
})();
