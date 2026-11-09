/* ORBLINGS.io — global tuning. Everything gameplay-relevant lives here so
 * balancing (and a future authoritative server) can share one source. */
(function () {
  const OB = (window.OB = window.OB || {});

  OB.VERSION = '1.0.0';

  OB.CONFIG = {
    ARENA_RADIUS: 2600,
    GRID_CELL: 128,

    PELLET_TARGET: 950,
    PELLET_REGEN_PER_STEP: 24,
    PELLET_GOLD_CHANCE: 0.025,
    PELLET_MASS: 1,
    PELLET_GOLD_MASS: 6,
    PELLET_COLORS: ['#ff5d8f', '#ffb84d', '#7cff6b', '#4de1ff', '#a77dff', '#ff7b4d', '#5dffc9', '#ffe14d'],

    BOT_START: 13,
    BOT_MAX: 20,

    START_MASS: 20,
    MIN_MASS: 9,
    EAT_RATIO: 1.18, // must be this many times heavier to absorb
    EAT_GAIN: 0.8,
    KILL_BONUS: 25,
    DECAY_START: 350, // mass above which slow decay kicks in
    DECAY_RATE: 0.0022, // fraction per second of the mass above DECAY_START

    BASE_SPEED: 275,
    MIN_SPEED: 100,
    ACCEL: 7,
    MAGNET_RANGE: 38,

    MOON: {
      base: 1,
      massPer: 45,
      max: 8,
      respawn: 2.6,
      hitCooldown: 0.32,
    },

    PULSE: {
      cooldown: 6.5,
      duration: 1.0,
      orbitMult: 2.5,
      spinMult: 1.7,
      speedMult: 1.9,
      boostTime: 0.7,
      pushRange: 230,
    },

    SPAWN_SHIELD: 2.5,
    BOT_RESPAWN: [1.5, 4],

    // Difficulty ramps up over a run (2-5 minute sessions)
    DIFFICULTY_RAMP_SECONDS: 150,
  };
})();
