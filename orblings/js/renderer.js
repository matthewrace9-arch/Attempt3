/* Canvas 2D renderer. Glows are pre-rendered sprites (no shadowBlur) so it
 * stays at 60 FPS on phones. */
(function () {
  const OB = (window.OB = window.OB || {});
  const U = OB.U;
  const Physics = OB.Physics;
  const FONT = "'Fredoka', 'Baloo 2', 'Nunito', system-ui, -apple-system, 'Segoe UI', sans-serif";

  const spriteCache = {};
  function glowSprite(color, core = true) {
    const key = color + (core ? '1' : '0');
    if (spriteCache[key]) return spriteCache[key];
    const s = 64;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    if (core) {
      grd.addColorStop(0, U.mix(color, '#ffffff', 0.7));
      grd.addColorStop(0.22, color);
      grd.addColorStop(0.32, U.rgba(color, 0.55));
      grd.addColorStop(0.6, U.rgba(color, 0.14));
      grd.addColorStop(1, U.rgba(color, 0));
    } else {
      grd.addColorStop(0, U.rgba(color, 0.7));
      grd.addColorStop(0.4, U.rgba(color, 0.22));
      grd.addColorStop(1, U.rgba(color, 0));
    }
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    spriteCache[key] = c;
    return c;
  }

  function makeStarTile() {
    const s = 384;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * 0.5 + 0.1;
      g.fillStyle = `rgba(${200 + Math.random() * 55 | 0},${190 + Math.random() * 65 | 0},255,${a})`;
      const r = Math.random() < 0.85 ? 0.8 : 1.6;
      g.beginPath();
      g.arc(Math.random() * s, Math.random() * s, r, 0, U.TAU);
      g.fill();
    }
    return c;
  }

  function rainbow(t, offset = 0) {
    return `hsl(${((t * 60 + offset) % 360) | 0},95%,62%)`;
  }

  /** Draws an orbling body with face. Shared by the game and the UI previews. */
  function drawBody(ctx, x, y, r, skin, o) {
    o = o || {};
    const time = o.time || 0;
    const heading = o.heading || 0;
    const sq = o.squash || 0;
    let c1 = skin.c1, c2 = skin.c2;
    if (skin.pattern === 'rainbow') { c1 = rainbow(time); c2 = '#ffffff'; }

    ctx.save();
    ctx.translate(x, y);
    if (sq) {
      ctx.rotate(heading);
      ctx.scale(1 + sq * 0.5, 1 - sq * 0.4);
      ctx.rotate(-heading);
    }

    // body
    const grd = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.08, 0, 0, r);
    grd.addColorStop(0, skin.pattern === 'rainbow' ? '#ffffff' : U.mix(skin.c1, '#ffffff', 0.45));
    grd.addColorStop(0.55, c1);
    grd.addColorStop(1, skin.pattern === 'rainbow' ? rainbow(time, 120) : U.mix(skin.c1, '#000022', 0.35));
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, U.TAU);
    ctx.fill();

    // pattern
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, U.TAU);
    ctx.clip();
    switch (skin.pattern) {
      case 'ring':
        ctx.strokeStyle = U.rgba(skin.c2, 0.55);
        ctx.lineWidth = r * 0.12;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, U.TAU); ctx.stroke();
        break;
      case 'core': {
        const g2 = ctx.createRadialGradient(0, r * 0.15, 0, 0, r * 0.15, r * 0.6);
        g2.addColorStop(0, U.rgba(skin.c2, 0.85));
        g2.addColorStop(1, U.rgba(skin.c2, 0));
        ctx.fillStyle = g2;
        ctx.fillRect(-r, -r, r * 2, r * 2);
        break;
      }
      case 'stripes':
        ctx.rotate(0.6 + time * 0.2);
        ctx.fillStyle = U.rgba(skin.c2, 0.35);
        for (let i = -3; i <= 3; i += 2) ctx.fillRect(i * r * 0.32 - r * 0.12, -r, r * 0.24, r * 2);
        break;
      case 'spiral':
        ctx.rotate(time * 1.2);
        ctx.strokeStyle = U.rgba(skin.c2, 0.5);
        ctx.lineWidth = r * 0.1;
        ctx.lineCap = 'round';
        for (let k = 0; k < 2; k++) {
          ctx.beginPath();
          for (let i = 0; i <= 20; i++) {
            const t = i / 20;
            const a = k * Math.PI + t * Math.PI * 1.6;
            const rr = r * (0.15 + t * 0.75);
            if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
            else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          ctx.stroke();
        }
        break;
      case 'star': {
        ctx.rotate(time * 0.6);
        ctx.fillStyle = U.rgba(skin.c2, 0.45);
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * U.TAU - Math.PI / 2;
          const rr = i % 2 === 0 ? r * 0.85 : r * 0.38;
          if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'rainbow':
        ctx.rotate(time);
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = rainbow(time, i * 60).replace('hsl', 'hsla').replace('%)', '%,0.35)');
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, r, (i / 6) * U.TAU, ((i + 0.5) / 6) * U.TAU);
          ctx.fill();
        }
        break;
    }
    ctx.restore();

    // gloss highlight
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.38, -r * 0.48, r * 0.26, r * 0.14, -0.6, 0, U.TAU);
    ctx.fill();

    // rim
    ctx.strokeStyle = U.rgba(skin.pattern === 'rainbow' ? '#ffffff' : skin.c2, 0.6);
    ctx.lineWidth = Math.max(1.5, r * 0.06);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.97, 0, U.TAU);
    ctx.stroke();

    // face
    if (r > 6) {
      const lx = Math.cos(heading), ly = Math.sin(heading);
      const fx = lx * r * 0.2, fy = ly * r * 0.16 - r * 0.05;
      const px = -ly, py = lx; // perpendicular
      const sep = r * 0.3;
      const er = r * 0.2;
      const blink = o.blink ? 0.12 : 1;
      const hurt = (o.flash || 0) > 0;
      for (let s = -1; s <= 1; s += 2) {
        const ex = fx + px * sep * s * (Math.abs(lx) > 0.7 ? 0.9 : 1);
        const ey = fy + py * sep * s * 0.6 + (Math.abs(lx) > 0.7 ? 0 : 0);
        ctx.save();
        ctx.translate(ex, ey);
        ctx.scale(1, blink);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, er, 0, U.TAU);
        ctx.fill();
        if (hurt) {
          ctx.strokeStyle = '#1b1035';
          ctx.lineWidth = er * 0.35;
          ctx.beginPath();
          ctx.moveTo(-er * 0.5, -er * 0.5); ctx.lineTo(er * 0.5, er * 0.5);
          ctx.moveTo(er * 0.5, -er * 0.5); ctx.lineTo(-er * 0.5, er * 0.5);
          ctx.stroke();
        } else {
          ctx.fillStyle = '#1b1035';
          ctx.beginPath();
          ctx.arc(lx * er * 0.38, ly * er * 0.38, er * 0.55, 0, U.TAU);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(lx * er * 0.38 - er * 0.2, ly * er * 0.38 - er * 0.22, er * 0.18, 0, U.TAU);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    if (o.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.6, o.flash * 2.4)})`;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, U.TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
      this.w = 0; this.h = 0; this.dpr = 1;
      this.starTile = makeStarTile();
      this.starPattern = this.ctx.createPattern(this.starTile, 'repeat');
      this.time = 0;
    }

    resize(w, h, dpr) {
      this.w = w; this.h = h; this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      const ctx = this.ctx;
      this.bgGrad = ctx.createRadialGradient(w / 2, h * 0.4, 0, w / 2, h * 0.4, Math.max(w, h) * 0.9);
      this.bgGrad.addColorStop(0, '#1a1145');
      this.bgGrad.addColorStop(1, '#070418');
      this.vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      this.vignette.addColorStop(0, 'rgba(255,30,70,0)');
      this.vignette.addColorStop(1, 'rgba(255,30,70,0.85)');
      this.starPattern = ctx.createPattern(this.starTile, 'repeat');
    }

    /**
     * @param s { world, cam:{x,y,zoom}, fx, input, player, dt, showStick, lowQuality }
     */
    render(s) {
      const ctx = this.ctx;
      const { world, cam, fx } = s;
      const dpr = this.dpr, w = this.w, h = this.h;
      this.time += s.dt;
      const time = this.time;
      const shake = fx.shakeOffset();
      const z = cam.zoom;

      // ---------- background (screen space)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = this.bgGrad;
      ctx.fillRect(0, 0, w, h);
      // parallax starfield
      const tile = this.starTile.width;
      const ox = ((-cam.x * z * 0.3) % tile + tile) % tile;
      const oy = ((-cam.y * z * 0.3) % tile + tile) % tile;
      ctx.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
      ctx.fillStyle = this.starPattern;
      ctx.fillRect(-tile, -tile, w + tile * 2, h + tile * 2);

      // ---------- world transform
      const tx = w / 2 - cam.x * z + shake.x;
      const ty = h / 2 - cam.y * z + shake.y;
      ctx.setTransform(dpr * z, 0, 0, dpr * z, tx * dpr, ty * dpr);
      const vl = cam.x - w / 2 / z - 60, vr = cam.x + w / 2 / z + 60;
      const vt = cam.y - h / 2 / z - 60, vb = cam.y + h / 2 / z + 60;
      const inView = (x, y, r) => x + r > vl && x - r < vr && y + r > vt && y - r < vb;
      const R = world.R;

      // grid
      const gs = 100;
      ctx.strokeStyle = 'rgba(150,130,255,0.075)';
      ctx.lineWidth = 2 / z > 3 ? 3 : 2;
      ctx.beginPath();
      for (let x = Math.floor(vl / gs) * gs; x < vr; x += gs) { ctx.moveTo(x, vt); ctx.lineTo(x, vb); }
      for (let y = Math.floor(vt / gs) * gs; y < vb; y += gs) { ctx.moveTo(vl, y); ctx.lineTo(vr, y); }
      ctx.stroke();

      // zone rings for orientation
      ctx.strokeStyle = 'rgba(140,200,255,0.06)';
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(0, 0, R * 0.33, 0, U.TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, R * 0.66, 0, U.TAU); ctx.stroke();

      // outside the arena
      ctx.fillStyle = 'rgba(8,0,20,0.55)';
      ctx.beginPath();
      ctx.rect(vl, vt, vr - vl, vb - vt);
      ctx.arc(0, 0, R, 0, U.TAU, true);
      ctx.fill('evenodd');
      // glowing border
      ctx.strokeStyle = 'rgba(255,79,163,0.12)';
      ctx.lineWidth = 40;
      ctx.beginPath(); ctx.arc(0, 0, R + 8, 0, U.TAU); ctx.stroke();
      ctx.strokeStyle = `rgba(255,120,200,${0.65 + Math.sin(time * 2) * 0.15})`;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, U.TAU); ctx.stroke();

      // ---------- pellets
      const pellets = world.pellets;
      for (let i = 0; i < pellets.length; i++) {
        const p = pellets[i];
        if (!inView(p.x, p.y, p.r * 2)) continue;
        const pulse = p.kind === 'g' ? 1 + Math.sin(time * 6 + p.phase) * 0.25 : 1 + Math.sin(time * 3 + p.phase) * 0.12;
        const sz = p.r * 3.4 * pulse;
        ctx.drawImage(glowSprite(p.color), p.x - sz / 2, p.y - sz / 2, sz, sz);
      }

      // ---------- orblings (small first so big ones overlap them)
      const list = world.orblings.slice().sort((a, b) => a.mass - b.mass);
      const player = s.player && s.player.alive ? s.player : null;
      const leader = world.leaderboard()[0];

      // glows + moon trails
      ctx.globalCompositeOperation = 'lighter';
      for (const o of list) {
        const reach = Physics.orbitDist(o) + o.moonR * 2;
        if (!inView(o.x, o.y, reach + o.r)) continue;
        const r = o.dispR;
        const gsz = r * 3.4;
        ctx.globalAlpha = 0.45;
        ctx.drawImage(glowSprite(o.skin.c1, false), o.x - gsz / 2, o.y - gsz / 2, gsz, gsz);
        ctx.globalAlpha = 1;
        // trails
        const dist = Physics.orbitDist(o);
        ctx.lineCap = 'round';
        ctx.lineWidth = o.moonR * 1.3;
        ctx.strokeStyle = U.rgba(o.skin.c2, o.pulseT > 0 ? 0.35 : 0.18);
        const trail = o.pulseT > 0 ? 0.9 : 0.55;
        for (const m of o.moons) {
          if (!m.alive) continue;
          ctx.beginPath();
          ctx.arc(o.x, o.y, dist, m.angle - trail, m.angle);
          ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = 'source-over';

      for (const o of list) {
        if (!inView(o.x, o.y, o.dispR + 10)) continue;
        // spawn shield bubble
        if (o.shield > 0) {
          ctx.strokeStyle = `rgba(160,240,255,${0.35 + Math.sin(time * 10) * 0.15})`;
          ctx.lineWidth = 3;
          ctx.setLineDash([8, 6]);
          ctx.lineDashOffset = -time * 30;
          ctx.beginPath(); ctx.arc(o.x, o.y, o.dispR + 8, 0, U.TAU); ctx.stroke();
          ctx.setLineDash([]);
        }
        drawBody(ctx, o.x, o.y, o.dispR, o.skin, {
          time, heading: o.heading, squash: o.squash, blink: o.blinkT < 0, flash: o.hitFlash,
        });
      }

      // moons
      for (const o of list) {
        const dist = Physics.orbitDist(o);
        if (!inView(o.x, o.y, dist + o.moonR * 2)) continue;
        const mr = o.moonR;
        for (const m of o.moons) {
          if (!m.alive) {
            ctx.fillStyle = U.rgba(o.skin.c2, 0.13);
            ctx.beginPath(); ctx.arc(m.x, m.y, mr * 0.55, 0, U.TAU); ctx.fill();
            continue;
          }
          const sc = 1 + m.pop * 0.7;
          const gsz = mr * 4.2 * sc;
          ctx.drawImage(glowSprite(o.skin.c2, false), m.x - gsz / 2, m.y - gsz / 2, gsz, gsz);
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(m.x, m.y, mr * sc, 0, U.TAU); ctx.fill();
          ctx.fillStyle = o.skin.pattern === 'rainbow' ? rainbow(time) : o.skin.c1;
          ctx.beginPath(); ctx.arc(m.x, m.y, mr * 0.55 * sc, 0, U.TAU); ctx.fill();
        }
      }

      // ---------- effects (world space)
      for (const rg of fx.rings) {
        const t = 1 - rg.life / rg.max;
        const e = 1 - Math.pow(1 - t, 3);
        ctx.strokeStyle = U.rgba(rg.color, (1 - t) * 0.8);
        ctx.lineWidth = rg.width * (1 - t * 0.6);
        ctx.beginPath(); ctx.arc(rg.x, rg.y, rg.r0 + (rg.r1 - rg.r0) * e, 0, U.TAU); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'lighter';
      for (const p of fx.particles) {
        if (!inView(p.x, p.y, 20)) continue;
        const a = p.life / p.max;
        ctx.globalAlpha = a;
        if (p.kind === 'spark') {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
          ctx.stroke();
        } else {
          const sz = p.size * 4 * (0.5 + a * 0.5);
          ctx.drawImage(glowSprite(p.color), p.x - sz / 2, p.y - sz / 2, sz, sz);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // ---------- screen-space overlays
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const toSX = (x) => (x - cam.x) * z + w / 2 + shake.x;
      const toSY = (y) => (y - cam.y) * z + h / 2 + shake.y;

      // names (colour-coded: red = can absorb you, green = you can absorb it)
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      for (const o of list) {
        if (s.hideNames || !inView(o.x, o.y, o.dispR + 40)) continue;
        const sr = o.dispR * z;
        const size = U.clamp(10 + sr * 0.12, 11, 17);
        const sx = toSX(o.x), sy = toSY(o.y) - sr - size * 0.9;
        let color = '#ffffff';
        if (player && o !== player) {
          if (o.mass >= player.mass * OB.CONFIG.EAT_RATIO) color = '#ff6b8b';
          else if (player.mass >= o.mass * OB.CONFIG.EAT_RATIO) color = '#7dffb0';
        }
        if (o === player) color = '#fff6a8';
        ctx.font = `600 ${size}px ${FONT}`;
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = 'rgba(10,4,30,0.7)';
        ctx.strokeText(o.name, sx, sy);
        ctx.fillStyle = color;
        ctx.fillText(o.name, sx, sy);
        if (o === leader && world.orblings.length > 1) this.crown(ctx, sx, sy - size * 1.1, size * 0.9, time);
      }

      // floating text
      for (const t of fx.texts) {
        const a = Math.min(1, (t.life / t.max) * 2.5);
        const size = t.size * (1 + t.pop * 0.5);
        ctx.globalAlpha = a;
        ctx.font = `${t.bold ? 700 : 500} ${size}px ${FONT}`;
        ctx.lineWidth = Math.max(3, size * 0.18);
        ctx.strokeStyle = 'rgba(10,4,30,0.75)';
        const sx = toSX(t.x), sy = toSY(t.y);
        ctx.strokeText(t.str, sx, sy);
        ctx.fillStyle = t.color;
        ctx.fillText(t.str, sx, sy);
      }
      ctx.globalAlpha = 1;

      // offscreen threat arrows: warn about big hunters approaching
      if (player) this.threatArrows(ctx, world, player, cam, w, h);

      // joystick
      const inp = s.input;
      if (s.showStick && inp && inp.active) {
        if (inp.mode === 'joystick') {
          ctx.fillStyle = 'rgba(255,255,255,0.07)';
          ctx.strokeStyle = 'rgba(255,255,255,0.28)';
          ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(inp.baseX, inp.baseY, inp.stickRadius, 0, U.TAU); ctx.fill(); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.beginPath(); ctx.arc(inp.knobX, inp.knobY, 28, 0, U.TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath(); ctx.arc(inp.knobX, inp.knobY, 28, 0, U.TAU); ctx.stroke();
        } else {
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(inp.fingerX, inp.fingerY, 22, 0, U.TAU); ctx.stroke();
        }
      }

      // hurt vignette
      if (fx.hurtFlash > 0.01) {
        ctx.globalAlpha = fx.hurtFlash * 0.55;
        ctx.fillStyle = this.vignette;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      }
    }

    crown(ctx, x, y, s, time) {
      ctx.save();
      ctx.translate(x, y + Math.sin(time * 3) * 1.5);
      ctx.fillStyle = '#ffd23f';
      ctx.strokeStyle = 'rgba(10,4,30,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-s * 0.6, s * 0.3);
      ctx.lineTo(-s * 0.7, -s * 0.35);
      ctx.lineTo(-s * 0.3, 0);
      ctx.lineTo(0, -s * 0.5);
      ctx.lineTo(s * 0.3, 0);
      ctx.lineTo(s * 0.7, -s * 0.35);
      ctx.lineTo(s * 0.6, s * 0.3);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      ctx.restore();
    }

    threatArrows(ctx, world, player, cam, w, h) {
      const z = cam.zoom;
      const halfW = w / 2 / z, halfH = h / 2 / z;
      for (const o of world.orblings) {
        if (o === player || o.mass < player.mass * OB.CONFIG.EAT_RATIO) continue;
        const dx = o.x - cam.x, dy = o.y - cam.y;
        if (Math.abs(dx) < halfW + o.r * 0.5 && Math.abs(dy) < halfH + o.r * 0.5) continue;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 1100 + o.r) continue;
        const a = Math.atan2(dy, dx);
        // place arrow on the screen edge
        const m = 34;
        const sx = U.clamp(w / 2 + Math.cos(a) * w, m, w - m);
        const sy = U.clamp(h / 2 + Math.sin(a) * h, m + 80, h - m - 40);
        const alpha = 0.4 + (1 - d / (1100 + o.r)) * 0.6;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(a);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ff5c7c';
        ctx.beginPath();
        ctx.moveTo(14, 0); ctx.lineTo(-8, -10); ctx.lineTo(-3, 0); ctx.lineTo(-8, 10);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
  }

  Renderer.drawBody = drawBody;
  Renderer.glowSprite = glowSprite;
  OB.Renderer = Renderer;
})();
