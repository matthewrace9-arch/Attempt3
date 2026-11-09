/* Entity data types. Kept as plain data so they can be serialised for
 * networking (see net.js). */
(function () {
  const OB = (window.OB = window.OB || {});
  const C = OB.CONFIG;
  const U = OB.U;

  class Orbling {
    constructor(id, opts) {
      this.id = id;
      this.name = opts.name || 'Orbling';
      this.skin = opts.skin || OB.Cosmetics.SKINS[0];
      this.isPlayer = !!opts.isPlayer;
      this.x = opts.x || 0;
      this.y = opts.y || 0;
      this.vx = 0; this.vy = 0; // steering velocity
      this.kx = 0; this.ky = 0; // knockback velocity
      this.mass = opts.mass || C.START_MASS;
      this.dispR = OB.Physics.radiusOf(this.mass) * 0.3;
      this.dispV = 0;
      this.heading = Math.random() * U.TAU;
      this.alive = true;

      this.intent = { mx: 0, my: 0, ability: false };

      this.moons = [];
      this.moonR = OB.Physics.moonRadius(this.mass);
      this.orbitAngle = Math.random() * U.TAU;
      this.orbitMult = 1;

      this.cooldown = 1.5;
      this.pulseT = 0;
      this.boostT = 0;
      this.shield = opts.shield != null ? opts.shield : C.SPAWN_SHIELD;
      this.hitCD = 0;
      this.hitFlash = 0;
      this.recentHit = 0;
      this.squash = 0;
      this.blinkT = U.rand(1, 4);

      this.score = 0;
      this.kills = 0;
      this.moonHits = 0;
      this.pulses = 0;
      this.energy = 0;
      this.spawnTime = 0;

      this.ai = null;
    }
    get r() {
      return OB.Physics.radiusOf(this.mass);
    }
    gain(mass) {
      this.mass += mass;
      this.score += mass;
    }
  }

  /** Pellets are hot-path objects: plain objects, recycled by the world. */
  function makePellet(x, y, mass, kind, color, vx, vy) {
    return {
      x, y,
      vx: vx || 0, vy: vy || 0,
      mass,
      kind, // 'n' normal, 'g' gold, 's' spilled
      color,
      r: kind === 'g' ? 9 : 5 + Math.sqrt(mass) * 1.8,
      lockId: 0, lockT: 0,
      phase: Math.random() * U.TAU,
      dead: false,
    };
  }

  OB.Orbling = Orbling;
  OB.makePellet = makePellet;
})();
