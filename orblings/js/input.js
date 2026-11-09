/* Input: floating virtual joystick (default), "follow finger" mode, mouse
 * steering and keyboard on desktop. Produces a movement intent vector. */
(function () {
  const OB = (window.OB = window.OB || {});
  const U = OB.U;

  const STICK_R = 62; // max knob travel in CSS px
  const DEADZONE = 6;

  class Input {
    constructor(canvas) {
      this.canvas = canvas;
      this.mode = 'joystick'; // 'joystick' | 'follow'
      this.enabled = false;
      this.touchId = null;
      this.baseX = 0; this.baseY = 0;
      this.knobX = 0; this.knobY = 0;
      this.fingerX = 0; this.fingerY = 0;
      this.active = false;
      this.lastDX = 0; this.lastDY = 0;
      this.mouse = { x: 0, y: 0, inside: false, used: false };
      this.keys = {};
      this.abilityQueued = false;
      this.onFirstMove = null;

      const opts = { passive: false };
      canvas.addEventListener('pointerdown', (e) => this.down(e), opts);
      window.addEventListener('pointermove', (e) => this.move(e), opts);
      window.addEventListener('pointerup', (e) => this.up(e), opts);
      window.addEventListener('pointercancel', (e) => this.up(e), opts);
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      canvas.addEventListener('mouseleave', () => (this.mouse.inside = false));
      window.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        this.keys[k] = true;
        if (this.enabled && (k === ' ' || k === 'e' || k === 'shift')) {
          this.abilityQueued = true;
          e.preventDefault();
        }
      });
      window.addEventListener('keyup', (e) => (this.keys[e.key.toLowerCase()] = false));
      window.addEventListener('blur', () => { this.keys = {}; this.release(); });
    }

    reset() {
      this.release();
      this.lastDX = 0; this.lastDY = 0;
      this.abilityQueued = false;
      this.keys = {};
    }

    release() {
      this.active = false;
      this.touchId = null;
    }

    down(e) {
      if (e.pointerType === 'mouse') {
        this.mouse.used = true;
        this.mouse.inside = true;
        this.mouse.x = e.clientX; this.mouse.y = e.clientY;
        if (e.button === 2 && this.enabled) this.abilityQueued = true;
        return;
      }
      e.preventDefault();
      if (!this.enabled || this.touchId !== null) return;
      this.touchId = e.pointerId;
      this.active = true;
      this.baseX = this.knobX = this.fingerX = e.clientX;
      this.baseY = this.knobY = this.fingerY = e.clientY;
      try { this.canvas.setPointerCapture(e.pointerId); } catch (err) {}
      if (this.onFirstMove) this.onFirstMove();
    }

    move(e) {
      if (e.pointerType === 'mouse') {
        this.mouse.x = e.clientX; this.mouse.y = e.clientY;
        this.mouse.inside = true;
        this.mouse.used = true;
        return;
      }
      if (e.pointerId !== this.touchId) return;
      e.preventDefault();
      this.fingerX = e.clientX; this.fingerY = e.clientY;
      let dx = e.clientX - this.baseX, dy = e.clientY - this.baseY;
      const d = Math.sqrt(dx * dx + dy * dy);
      // floating base: drag past the rim and the stick follows your thumb
      if (d > STICK_R * 1.35) {
        const over = d - STICK_R * 1.35;
        this.baseX += (dx / d) * over;
        this.baseY += (dy / d) * over;
        dx = e.clientX - this.baseX; dy = e.clientY - this.baseY;
      }
      const dd = Math.sqrt(dx * dx + dy * dy);
      const k = dd > STICK_R ? STICK_R / dd : 1;
      this.knobX = this.baseX + dx * k;
      this.knobY = this.baseY + dy * k;
    }

    up(e) {
      if (e.pointerType === 'mouse') return;
      if (e.pointerId !== this.touchId) return;
      this.release();
    }

    consumeAbility() {
      const a = this.abilityQueued;
      this.abilityQueued = false;
      return a;
    }

    /**
     * @param px, py  player position on screen (CSS px)
     * @returns {mx,my} movement intent with magnitude 0..1
     */
    getIntent(px, py) {
      // keyboard overrides everything
      let kx = 0, ky = 0;
      const K = this.keys;
      if (K['a'] || K['arrowleft']) kx -= 1;
      if (K['d'] || K['arrowright']) kx += 1;
      if (K['w'] || K['arrowup']) ky -= 1;
      if (K['s'] || K['arrowdown']) ky += 1;
      if (kx || ky) {
        const l = Math.sqrt(kx * kx + ky * ky);
        this.lastDX = kx / l; this.lastDY = ky / l;
        return { mx: kx / l, my: ky / l };
      }

      if (this.active) {
        let dx, dy, mag;
        if (this.mode === 'follow') {
          dx = this.fingerX - px; dy = this.fingerY - py;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < DEADZONE * 2) return { mx: this.lastDX * 0.2, my: this.lastDY * 0.2 };
          mag = U.clamp(d / 110, 0.25, 1);
          dx /= d; dy /= d;
        } else {
          dx = this.knobX - this.baseX; dy = this.knobY - this.baseY;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < DEADZONE) return { mx: this.lastDX * 0.55, my: this.lastDY * 0.55 };
          mag = U.clamp(d / (STICK_R * 0.7), 0.3, 1);
          dx /= d; dy /= d;
        }
        this.lastDX = dx; this.lastDY = dy;
        return { mx: dx * mag, my: dy * mag };
      }

      if (this.mouse.used && this.mouse.inside) {
        const dx = this.mouse.x - px, dy = this.mouse.y - py;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 8) return { mx: 0, my: 0 };
        const mag = U.clamp(d / 140, 0, 1);
        this.lastDX = dx / d; this.lastDY = dy / d;
        return { mx: (dx / d) * mag, my: (dy / d) * mag };
      }

      // thumb lifted: keep gliding gently in the last direction
      return { mx: this.lastDX * 0.5, my: this.lastDY * 0.5 };
    }

    get stickRadius() {
      return STICK_R;
    }
  }

  OB.Input = Input;
})();
