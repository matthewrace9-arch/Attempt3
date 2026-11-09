/* Networking seam.
 *
 * The game talks to a "session" instead of a World directly:
 *   session.join(name, skinId)  -> player handle
 *   session.sendInput(intent)   -> {mx, my, ability}
 *   session.update(dt)          -> advances / syncs the world
 *   session.world               -> what the renderer draws
 *   session.drainEvents()       -> gameplay events for audio/fx/UI
 *
 * LocalSession runs the authoritative World in the browser with AI rivals.
 * A future RemoteSession would send intents over a WebSocket and apply
 * snapshots produced by `serializeSnapshot` on a Node server that runs the
 * very same World/Physics/Collision/AI files (they have no DOM dependencies).
 */
(function () {
  const OB = (window.OB = window.OB || {});

  class LocalSession {
    constructor(opts = {}) {
      this.world = new OB.World(opts);
      this.player = null;
      this.kind = 'local';
    }
    join(name, skin) {
      this.player = this.world.addPlayer(name, skin);
      return this.player;
    }
    sendInput(intent) {
      if (!this.player || !this.player.alive) return;
      this.player.intent.mx = intent.mx;
      this.player.intent.my = intent.my;
      if (intent.ability) this.player.intent.ability = true;
    }
    update(dt) {
      // fixed-size sub-steps keep collisions stable on slow frames
      let remaining = Math.min(dt, 0.1);
      while (remaining > 1e-6) {
        const step = Math.min(remaining, 1 / 60);
        this.world.step(step);
        remaining -= step;
      }
    }
    drainEvents() {
      return this.world.drainEvents();
    }
  }

  /** Compact snapshot a server could broadcast at ~20 Hz. */
  function serializeSnapshot(world) {
    return {
      t: Math.round(world.time * 1000),
      o: world.orblings.map((o) => [
        o.id, Math.round(o.x), Math.round(o.y), Math.round(o.mass * 10) / 10,
        +o.heading.toFixed(2), +o.orbitAngle.toFixed(2), +o.orbitMult.toFixed(2),
        o.moons.map((m) => (m.alive ? 1 : 0)).join(''), o.shield > 0 ? 1 : 0,
        o.name, o.skin.id,
      ]),
    };
  }

  /** Applies a snapshot onto a client-side world (for a RemoteSession). */
  function applySnapshot(world, snap) {
    const seen = new Set();
    const byId = new Map(world.orblings.map((o) => [o.id, o]));
    for (const row of snap.o) {
      const [id, x, y, mass, heading, orbitAngle, orbitMult, moons, shield, name, skinId] = row;
      let o = byId.get(id);
      if (!o) {
        o = new OB.Orbling(id, { name, skin: OB.Cosmetics.get(skinId), mass, x, y });
        world.orblings.push(o);
      }
      o.x = x; o.y = y; o.mass = mass; o.heading = heading;
      o.orbitAngle = orbitAngle; o.orbitMult = orbitMult; o.shield = shield ? 1 : 0;
      OB.Physics.updateMoons(o, 0);
      for (let i = 0; i < o.moons.length; i++) o.moons[i].alive = moons[i] === '1';
      seen.add(id);
    }
    world.orblings = world.orblings.filter((o) => seen.has(o.id));
    world.time = snap.t / 1000;
  }

  OB.Net = { LocalSession, serializeSnapshot, applySnapshot };
})();
