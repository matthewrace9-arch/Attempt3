/* Spatial hash + all collision resolution: pickups, absorption, bumping,
 * moon strikes and moon clashes. */
(function () {
  const OB = (window.OB = window.OB || {});
  const C = OB.CONFIG;
  const U = OB.U;

  /** Fixed-size uniform grid over the (bounded) arena, rebuilt every step. */
  class SpatialGrid {
    constructor(radius, cell) {
      this.cell = cell;
      this.offset = radius + cell;
      this.cols = Math.ceil((radius * 2 + cell * 2) / cell);
      this.cells = new Array(this.cols * this.cols);
      for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
    }
    clear() {
      for (let i = 0; i < this.cells.length; i++) this.cells[i].length = 0;
    }
    key(x, y) {
      const cx = U.clamp(Math.floor((x + this.offset) / this.cell), 0, this.cols - 1);
      const cy = U.clamp(Math.floor((y + this.offset) / this.cell), 0, this.cols - 1);
      return cy * this.cols + cx;
    }
    insert(item) {
      this.cells[this.key(item.x, item.y)].push(item);
    }
    /** calls fn(item) for each item in cells overlapping the box */
    query(x, y, range, fn) {
      const c = this.cell, o = this.offset, n = this.cols - 1;
      const x0 = U.clamp(Math.floor((x - range + o) / c), 0, n);
      const x1 = U.clamp(Math.floor((x + range + o) / c), 0, n);
      const y0 = U.clamp(Math.floor((y - range + o) / c), 0, n);
      const y1 = U.clamp(Math.floor((y + range + o) / c), 0, n);
      for (let cy = y0; cy <= y1; cy++) {
        const row = cy * this.cols;
        for (let cx = x0; cx <= x1; cx++) {
          const arr = this.cells[row + cx];
          for (let i = 0; i < arr.length; i++) {
            if (fn(arr[i]) === false) return;
          }
        }
      }
    }
  }

  const Collision = {
    SpatialGrid,

    pickups(world, dt) {
      const grid = world.grid;
      for (const o of world.orblings) {
        if (!o.alive) continue;
        const r = o.r;
        const range = r + C.MAGNET_RANGE + o.r * 0.25;
        grid.query(o.x, o.y, range, (p) => {
          if (p.dead) return;
          if (p.lockT > 0 && p.lockId === o.id) return;
          const dx = o.x - p.x, dy = o.y - p.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > range * range) return;
          const d = Math.sqrt(d2) || 1;
          if (d < r) {
            p.dead = true;
            o.gain(p.mass);
            o.energy += p.mass;
            world.emit('pickup', { o, mass: p.mass, kind: p.kind, color: p.color, x: p.x, y: p.y });
          } else {
            // magnet pull — speeds up the closer it gets
            const pull = (520 + o.r * 2) * (1 - (d - r) / (range - r + 1)) * dt;
            p.x += (dx / d) * Math.min(pull, d);
            p.y += (dy / d) * Math.min(pull, d);
          }
        });
      }
    },

    bodies(world) {
      const list = world.orblings;
      const n = list.length;
      for (let i = 0; i < n; i++) {
        const a = list[i];
        if (!a.alive) continue;
        for (let j = i + 1; j < n; j++) {
          const b = list[j];
          if (!b.alive || !a.alive) continue;
          const ra = a.r, rb = b.r;
          const dx = b.x - a.x, dy = b.y - a.y;
          const sum = ra + rb;
          if (dx > sum || dx < -sum || dy > sum || dy < -sum) continue;
          const d2 = dx * dx + dy * dy;
          if (d2 >= sum * sum) continue;
          const d = Math.sqrt(d2) || 0.001;

          const big = a.mass >= b.mass ? a : b;
          const small = big === a ? b : a;
          const canEat = big.mass >= small.mass * C.EAT_RATIO && big.shield <= 0 && small.shield <= 0;
          if (canEat) {
            if (d < big.r - small.r * 0.35) world.absorb(big, small);
          } else {
            // soft bump so equals don't overlap
            const overlap = sum - d;
            const nx = dx / d, ny = dy / d;
            const wa = b.mass / (a.mass + b.mass), wb = 1 - wa;
            a.x -= nx * overlap * wa * 0.5; a.y -= ny * overlap * wa * 0.5;
            b.x += nx * overlap * wb * 0.5; b.y += ny * overlap * wb * 0.5;
          }
        }
      }
    },

    moons(world) {
      const list = world.orblings;
      // moon -> body strikes
      for (const a of list) {
        if (!a.alive) continue;
        const mr = a.moonR;
        for (const m of a.moons) {
          if (!m.alive) continue;
          for (const b of list) {
            if (b === a || !b.alive || b.shield > 0 || b.hitCD > 0) continue;
            const rr = b.r + mr;
            const dx = b.x - m.x, dy = b.y - m.y;
            if (dx > rr || dx < -rr || dy > rr || dy < -rr) continue;
            if (dx * dx + dy * dy > rr * rr) continue;
            world.moonStrike(a, m, b);
            break;
          }
        }
      }
      // moon <-> moon clashes (different owners)
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (!a.alive) continue;
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j];
          if (!b.alive) continue;
          // owners far apart can't have touching moons
          const reach = a.r + b.r + (a.moonR + 10 + a.r * 0.25) * a.orbitMult + (b.moonR + 10 + b.r * 0.25) * b.orbitMult + a.moonR + b.moonR;
          if (Math.abs(a.x - b.x) > reach || Math.abs(a.y - b.y) > reach) continue;
          const rr = a.moonR + b.moonR;
          for (const ma of a.moons) {
            if (!ma.alive) continue;
            for (const mb of b.moons) {
              if (!mb.alive) continue;
              if (U.dist2(ma.x, ma.y, mb.x, mb.y) < rr * rr) {
                ma.alive = false; ma.t = C.MOON.respawn;
                mb.alive = false; mb.t = C.MOON.respawn;
                world.emit('clash', { a, b, x: (ma.x + mb.x) / 2, y: (ma.y + mb.y) / 2 });
                break;
              }
            }
          }
        }
      }
    },
  };

  OB.SpatialGrid = SpatialGrid;
  OB.Collision = Collision;
})();
