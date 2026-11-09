/* Bot brains. Each bot only writes to its orbling's `intent`, exactly like
 * a human (or a remote client) would, so bots and players are interchangeable. */
(function () {
  const OB = (window.OB = window.OB || {});
  const C = OB.CONFIG;
  const U = OB.U;
  const Physics = OB.Physics;

  const PERSONALITIES = {
    aggressive: { chase: 1.8, flee: 0.8, food: 0.55, harass: 1.0, fleeRange: 0.9, react: [0.1, 0.2], pulseChance: 0.9, spilled: 1.3, wander: 0, playerBias: 1.15 },
    defensive: { chase: 0.5, flee: 2.0, food: 1.0, harass: 0.15, fleeRange: 1.6, react: [0.12, 0.24], pulseChance: 0.65, spilled: 1.0, wander: 0, playerBias: 0.8 },
    opportunistic: { chase: 1.1, flee: 1.3, food: 0.9, harass: 0.45, fleeRange: 1.2, react: [0.1, 0.2], pulseChance: 0.75, spilled: 3.2, wander: 0, preferWounded: true, playerBias: 1.0 },
    random: { chase: 0.9, flee: 1.0, food: 0.7, harass: 0.35, fleeRange: 0.9, react: [0.18, 0.45], pulseChance: 0.45, spilled: 1.0, wander: 0.8, playerBias: 1.0 },
  };
  const KEYS = Object.keys(PERSONALITIES);

  class BotBrain {
    constructor(o, personality) {
      this.o = o;
      this.kind = personality;
      this.p = PERSONALITIES[personality];
      this.skill = U.rand(0.35, 0.95); // awareness: low-skill bots react late (catchable)
      this.thinkT = U.rand(0, 0.3);
      this.dirX = Math.cos(o.heading);
      this.dirY = Math.sin(o.heading);
      this.wanderX = 0; this.wanderY = 0; this.wanderT = 0;
      this.lastX = o.x; this.lastY = o.y; this.stuckT = 2;
      this.mag = 1;
    }

    update(dt, world) {
      const o = this.o;
      this.thinkT -= dt;
      if (this.thinkT <= 0) {
        this.thinkT = U.rand(this.p.react[0], this.p.react[1]) / world.difficulty;
        this.think(world);
      }
      // stuck detection: if barely moved in 2s, pick a fresh wander point
      this.stuckT -= dt;
      this.wanderT -= dt;
      if (this.stuckT <= 0) {
        if (U.dist2(o.x, o.y, this.lastX, this.lastY) < 40 * 40) this.newWander(world, true);
        this.lastX = o.x; this.lastY = o.y; this.stuckT = 2;
      }
      // smooth steering so bots feel organic, not robotic
      const k = Math.min(1, dt * 8);
      o.intent.mx += (this.dirX * this.mag - o.intent.mx) * k;
      o.intent.my += (this.dirY * this.mag - o.intent.my) * k;
    }

    newWander(world, far) {
      const p = U.randInDisk(world.R * (far ? 0.75 : 0.85));
      this.wanderX = p.x; this.wanderY = p.y;
      this.wanderT = U.rand(3, 6);
    }

    think(world) {
      const o = this.o, p = this.p;
      const view = 420 + o.r * 4;
      let sx = 0, sy = 0;
      const notices = Math.random() < this.skill * (0.8 + 0.2 * world.ramp) + 0.05;

      let prey = null, preyScore = 0, preyD = 0;
      let threat = null, threatGap = Infinity;
      let rival = null, rivalScore = 0, rivalD = 0;

      for (const e of world.orblings) {
        if (e === o || !e.alive) continue;
        const dx = e.x - o.x, dy = e.y - o.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        if (d > view + e.r) continue;
        const gap = d - e.r - o.r;
        // breathing room for a freshly spawned player: hunters ease in over 30s
        const age = world.time - e.spawnTime;
        const earlyGrace = e.isPlayer ? (age < 15 ? 0 : age < 30 ? 0.5 : 1) : 1;

        if (e.mass >= o.mass * C.EAT_RATIO) {
          // THREAT — flee proportional to proximity
          const danger = (140 + e.r * 0.8 + 160 * p.fleeRange) * (0.5 + 0.5 * this.skill);
          if (gap < danger && (notices || gap < 60)) {
            const w = p.flee * (1 - gap / danger) * 3.2;
            sx -= (dx / d) * w;
            sy -= (dy / d) * w;
            if (gap < threatGap) { threatGap = gap; threat = e; }
          }
          // an enemy's moons are dangerous too
          const moonZone = Physics.orbitDist(e) + e.moonR + o.r + 20;
          if (d < moonZone && !(e.mass >= o.mass * C.EAT_RATIO && gap < danger)) {
            sx -= (dx / d) * 0.6; sy -= (dy / d) * 0.6;
          }
        } else if (o.mass >= e.mass * C.EAT_RATIO) {
          if (e.shield > 0) continue;
          // PREY
          let s = ((e.mass / o.mass) * p.chase) / (d / 220 + 1);
          if (p.preferWounded && e.recentHit > 0) s *= 2.2;
          if (e.isPlayer) s *= p.playerBias * earlyGrace;
          if (s <= 0) continue;
          if (s > preyScore) { preyScore = s; prey = e; preyD = d; }
        } else {
          // RIVAL of similar size — harass with moons if we have some
          const alive = o.moons.reduce((n, m) => n + (m.alive ? 1 : 0), 0);
          if (alive >= 2 && d < 360 + o.r) {
            let s = (p.harass * alive) / (d / 160 + 1);
            if (e.isPlayer) s *= earlyGrace;
            if (s <= 0) continue;
            if (s > rivalScore) { rivalScore = s; rival = e; rivalD = d; }
          }
        }
      }

      if (prey) {
        // lead the target a little
        const lx = prey.x + prey.vx * 0.35 - o.x, ly = prey.y + prey.vy * 0.35 - o.y;
        const ld = Math.sqrt(lx * lx + ly * ly) || 1;
        const w = 2.2 * Math.min(2, preyScore * 3);
        sx += (lx / ld) * w; sy += (ly / ld) * w;
      } else if (rival) {
        // approach to strike range (just outside its body), orbiting slightly
        const dx = rival.x - o.x, dy = rival.y - o.y;
        const ideal = Physics.pulseReach(o) * 0.8 + rival.r;
        const toward = rivalD > ideal ? 1 : -0.6;
        const w = 1.2 * rivalScore;
        sx += (dx / rivalD) * w * toward + (-dy / rivalD) * w * 0.5;
        sy += (dy / rivalD) * w * toward + (dx / rivalD) * w * 0.5;
      }

      // FOOD
      const food = world.findFood(o, 300 + o.r * 2, p.spilled);
      if (food) {
        const dx = food.x - o.x, dy = food.y - o.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const w = p.food * (prey ? 0.35 : 1) * 1.2;
        sx += (dx / d) * w; sy += (dy / d) * w;
      }

      // WANDER (when idle, or for the random personality)
      if (this.wanderT <= 0 || U.dist2(o.x, o.y, this.wanderX, this.wanderY) < 120 * 120) this.newWander(world, false);
      if (!food && !prey && !rival) {
        const dx = this.wanderX - o.x, dy = this.wanderY - o.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        sx += dx / d; sy += dy / d;
      } else if (p.wander > 0) {
        const dx = this.wanderX - o.x, dy = this.wanderY - o.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        sx += (dx / d) * p.wander * 0.6; sy += (dy / d) * p.wander * 0.6;
        // erratic jitter
        sx += U.rand(-0.5, 0.5); sy += U.rand(-0.5, 0.5);
      }

      // WALLS: never push into the edge — convert outward steering into a
      // slide along the wall so fleeing bots don't get pinned
      const distC = Math.sqrt(o.x * o.x + o.y * o.y) || 1;
      const edge = world.R - o.r - distC;
      if (edge < 260) {
        const nx = o.x / distC, ny = o.y / distC;
        const out = sx * nx + sy * ny;
        if (out > 0) {
          sx -= out * nx; sy -= out * ny;
          const tx = -ny, ty = nx;
          let side = sx * tx + sy * ty;
          if (Math.abs(side) < 0.05) side = this.wallSide || (this.wallSide = Math.random() < 0.5 ? -1 : 1);
          const sgn = side > 0 ? 1 : -1;
          sx += tx * sgn * out * 1.3; sy += ty * sgn * out * 1.3;
        }
        const w = (1 - edge / 260) * 1.8;
        sx -= nx * w; sy -= ny * w;
      }

      const len = Math.sqrt(sx * sx + sy * sy);
      if (len > 0.001) {
        this.dirX = sx / len; this.dirY = sy / len;
        this.mag = 1;
      }

      // ABILITY
      if (o.cooldown <= 0) {
        const roll = Math.random();
        if (threat && threatGap < 80 && roll < p.pulseChance) {
          o.intent.ability = true; // escape burst + shove
        } else {
          const reach = Physics.pulseReach(o);
          const t = prey || rival;
          if (t) {
            const d = Math.sqrt(U.dist2(o.x, o.y, t.x, t.y));
            const alive = o.moons.reduce((n, m) => n + (m.alive ? 1 : 0), 0);
            const gapT = d - o.r - t.r;
            if (alive > 0 && d < reach + t.r && d > o.r + t.r * 0.5 && roll < p.pulseChance * 0.8) o.intent.ability = true;
            else if (t === prey && gapT < 110 && gapT > 0 && roll < p.pulseChance * 0.6) o.intent.ability = true; // lunge
          } else if (this.kind === 'random' && roll < 0.02) {
            o.intent.ability = true;
          }
        }
      }
    }
  }

  OB.BotBrain = BotBrain;
  OB.AI = {
    PERSONALITIES,
    randomPersonality() {
      // weighted mix: slightly more opportunists/aggressors for action
      const r = Math.random();
      if (r < 0.3) return 'aggressive';
      if (r < 0.55) return 'opportunistic';
      if (r < 0.8) return 'defensive';
      return 'random';
    },
    KEYS,
  };
})();
