/* Size/speed formulas, movement integration, ability + moon orbits.
 * Pure simulation: no rendering, no DOM, no audio. */
(function () {
  const OB = (window.OB = window.OB || {});
  const C = OB.CONFIG;
  const U = OB.U;

  const Physics = {
    radiusOf(mass) {
      return 6 + Math.sqrt(mass) * 3.2;
    },
    speedOf(mass) {
      return Math.max(C.MIN_SPEED, C.BASE_SPEED * Math.pow(C.START_MASS / Math.max(mass, 1), 0.24));
    },
    moonCount(mass) {
      return Math.min(C.MOON.max, C.MOON.base + Math.floor(mass / C.MOON.massPer));
    },
    moonRadius(mass) {
      return 4.5 + Math.sqrt(mass) * 0.36;
    },
    /** distance of moon centre from orbling centre at the current orbit multiplier */
    orbitDist(o) {
      const r = o.r;
      const base = 10 + o.moonR + r * 0.25;
      return r + base * o.orbitMult;
    },
    pulseReach(o) {
      const base = 10 + o.moonR + o.r * 0.25;
      return o.r + base * C.PULSE.orbitMult + o.moonR;
    },

    updateOrbling(o, dt, world) {
      // timers
      if (o.shield > 0) o.shield -= dt;
      if (o.hitCD > 0) o.hitCD -= dt;
      if (o.hitFlash > 0) o.hitFlash -= dt;
      if (o.cooldown > 0) o.cooldown -= dt;
      if (o.pulseT > 0) o.pulseT -= dt;
      if (o.boostT > 0) o.boostT -= dt;
      if (o.recentHit > 0) o.recentHit -= dt;
      o.squash *= Math.pow(0.02, dt);
      o.blinkT -= dt;
      if (o.blinkT < -0.12) o.blinkT = U.rand(2, 5);

      // mass decay for very large orblings keeps runaway leaders in check
      if (o.mass > C.DECAY_START) o.mass -= (o.mass - C.DECAY_START) * C.DECAY_RATE * dt;

      // ability
      if (o.intent.ability) {
        o.intent.ability = false;
        if (o.cooldown <= 0) Physics.activatePulse(o, world);
      }

      // movement toward intent
      let mx = o.intent.mx, my = o.intent.my;
      let mag = Math.sqrt(mx * mx + my * my);
      if (mag > 1) { mx /= mag; my /= mag; mag = 1; }
      let maxSpeed = Physics.speedOf(o.mass);
      if (o.boostT > 0) maxSpeed *= C.PULSE.speedMult;
      const tx = mx * maxSpeed, ty = my * maxSpeed;
      const k = Math.min(1, dt * C.ACCEL);
      o.vx += (tx - o.vx) * k;
      o.vy += (ty - o.vy) * k;
      // knockback impulses decay on top of steering
      o.kx *= Math.pow(0.01, dt);
      o.ky *= Math.pow(0.01, dt);
      o.x += (o.vx + o.kx) * dt;
      o.y += (o.vy + o.ky) * dt;

      if (mag > 0.08) o.heading = o.heading + U.angDiff(o.heading, Math.atan2(my, mx)) * Math.min(1, dt * 10);

      // arena wall: slide along the edge
      const R = world.R - o.r;
      const d2 = o.x * o.x + o.y * o.y;
      if (d2 > R * R) {
        const d = Math.sqrt(d2);
        const nx = o.x / d, ny = o.y / d;
        o.x = nx * R; o.y = ny * R;
        const vn = o.vx * nx + o.vy * ny;
        if (vn > 0) { o.vx -= vn * nx; o.vy -= vn * ny; }
        const kn = o.kx * nx + o.ky * ny;
        if (kn > 0) { o.kx -= kn * nx * 1.6; o.ky -= kn * ny * 1.6; }
      }

      // smooth display radius (growth animation with a little overshoot)
      const r = o.r;
      o.dispV += (r - o.dispR) * 60 * dt;
      o.dispV *= Math.pow(0.0008, dt);
      o.dispR += o.dispV * dt;
      if (o.dispR < 1) o.dispR = 1;

      Physics.updateMoons(o, dt);
    },

    activatePulse(o, world) {
      const P = C.PULSE;
      o.cooldown = P.cooldown;
      o.pulseT = P.duration;
      o.boostT = P.boostTime;
      o.pulses++;
      // shove nearby lighter orblings away
      const range = P.pushRange + o.r;
      for (const e of world.orblings) {
        if (e === o || !e.alive) continue;
        const dx = e.x - o.x, dy = e.y - o.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        if (d < range + e.r && e.mass < o.mass * 1.4) {
          const f = (1 - d / (range + e.r)) * 520;
          e.kx += (dx / d) * f;
          e.ky += (dy / d) * f;
        }
      }
      world.emit('pulse', { o, x: o.x, y: o.y });
    },

    updateMoons(o, dt) {
      const want = Physics.moonCount(o.mass);
      while (o.moons.length < want) o.moons.push({ alive: false, t: 0.35, x: o.x, y: o.y, pop: 0, fresh: true });
      if (o.moons.length > want) o.moons.length = want;

      o.moonR = Physics.moonRadius(o.mass);
      const targetMult = o.pulseT > 0 ? C.PULSE.orbitMult : 1;
      o.orbitMult += (targetMult - o.orbitMult) * Math.min(1, dt * (targetMult > o.orbitMult ? 16 : 5));
      const spin = (3.0 - Math.min(1.5, o.r / 110)) * (o.pulseT > 0 ? C.PULSE.spinMult : 1);
      o.orbitAngle += spin * dt;

      const n = o.moons.length;
      const dist = Physics.orbitDist(o);
      for (let i = 0; i < n; i++) {
        const m = o.moons[i];
        const a = o.orbitAngle + (i / n) * U.TAU;
        m.angle = a;
        m.x = o.x + Math.cos(a) * dist;
        m.y = o.y + Math.sin(a) * dist;
        if (!m.alive) {
          m.t -= dt;
          if (m.t <= 0) { m.alive = true; m.pop = 1; }
        }
        if (m.pop > 0) m.pop = Math.max(0, m.pop - dt * 3);
      }
    },
  };

  OB.Physics = Physics;
})();
