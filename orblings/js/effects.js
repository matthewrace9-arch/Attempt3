/* Juice: particles, shockwave rings, floating numbers, screen shake, flashes.
 * Purely presentational. */
(function () {
  const OB = (window.OB = window.OB || {});
  const U = OB.U;
  const MAX_PARTICLES = 520;

  class Effects {
    constructor() {
      this.particles = [];
      this.rings = [];
      this.texts = [];
      this.trauma = 0;
      this.hurtFlash = 0;
      this.time = 0;
      this.scale = 1; // particle density (lowered on weak devices)
    }

    clear() {
      this.particles.length = 0;
      this.rings.length = 0;
      this.texts.length = 0;
      this.trauma = 0;
      this.hurtFlash = 0;
    }

    _particle() {
      if (this.particles.length < MAX_PARTICLES) {
        const p = {};
        this.particles.push(p);
        return p;
      }
      // recycle the oldest-ish particle
      let idx = 0, min = Infinity;
      for (let i = 0; i < 24; i++) {
        const j = (Math.random() * this.particles.length) | 0;
        if (this.particles[j].life < min) { min = this.particles[j].life; idx = j; }
      }
      return this.particles[idx];
    }

    burst(x, y, color, count, speed, size, life) {
      count = Math.max(1, Math.round(count * this.scale));
      for (let i = 0; i < count; i++) {
        const p = this._particle();
        const a = Math.random() * U.TAU;
        const s = speed * U.rand(0.3, 1);
        p.x = x; p.y = y;
        p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
        p.size = size * U.rand(0.6, 1.2);
        p.life = p.max = life * U.rand(0.6, 1.1);
        p.color = color;
        p.kind = 'dot';
      }
    }

    sparks(x, y, color, count, speed) {
      count = Math.max(1, Math.round(count * this.scale));
      for (let i = 0; i < count; i++) {
        const p = this._particle();
        const a = Math.random() * U.TAU;
        const s = speed * U.rand(0.5, 1);
        p.x = x; p.y = y;
        p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
        p.size = U.rand(1.5, 3);
        p.life = p.max = U.rand(0.18, 0.35);
        p.color = color;
        p.kind = 'spark';
      }
    }

    ring(x, y, color, r0, r1, life, width) {
      this.rings.push({ x, y, color, r0, r1, life, max: life, width: width || 6 });
    }

    /** world-space floating text */
    text(x, y, str, color, size, opts = {}) {
      this.texts.push({
        x, y, str, color, size,
        life: opts.life || 0.9,
        max: opts.life || 0.9,
        vy: opts.vy !== undefined ? opts.vy : -70,
        pop: 1,
        bold: opts.bold !== false,
      });
      if (this.texts.length > 40) this.texts.shift();
    }

    shake(amount) {
      this.trauma = Math.min(1, this.trauma + amount);
    }

    hurt(amount) {
      this.hurtFlash = Math.min(1, this.hurtFlash + amount);
    }

    shakeOffset() {
      const s = this.trauma * this.trauma * 18;
      if (s < 0.05) return { x: 0, y: 0 };
      return { x: (Math.random() * 2 - 1) * s, y: (Math.random() * 2 - 1) * s };
    }

    update(dt) {
      this.time += dt;
      this.trauma = Math.max(0, this.trauma - dt * 1.6);
      this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.2);
      const drag = Math.pow(0.04, dt);
      const ps = this.particles;
      let w = 0;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.life -= dt;
        if (p.life <= 0) continue;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= drag; p.vy *= drag;
        ps[w++] = p;
      }
      ps.length = w;
      for (let i = this.rings.length - 1; i >= 0; i--) {
        this.rings[i].life -= dt;
        if (this.rings[i].life <= 0) this.rings.splice(i, 1);
      }
      for (let i = this.texts.length - 1; i >= 0; i--) {
        const t = this.texts[i];
        t.life -= dt;
        t.y += t.vy * dt;
        t.vy *= Math.pow(0.15, dt);
        t.pop = Math.max(0, t.pop - dt * 5);
        if (t.life <= 0) this.texts.splice(i, 1);
      }
    }
  }

  OB.Effects = Effects;
})();
