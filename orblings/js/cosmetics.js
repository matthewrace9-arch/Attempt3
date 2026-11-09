/* Cosmetic catalog. Purely visual — nothing here affects gameplay (no pay-to-win).
 * Add a skin by appending to SKINS; unlock rules are data-driven:
 *   default | level:N | achievement:id | shards:cost | premium:sku
 */
(function () {
  const OB = (window.OB = window.OB || {});

  const SKINS = [
    { id: 'ember', name: 'Ember', c1: '#ff4f7b', c2: '#ffb199', pattern: 'solid', unlock: { type: 'default' }, rarity: 'common' },
    { id: 'aqua', name: 'Aqua', c1: '#1fb8ff', c2: '#9ff0ff', pattern: 'solid', unlock: { type: 'default' }, rarity: 'common' },
    { id: 'lime', name: 'Lime', c1: '#4bdc4b', c2: '#d4ff9c', pattern: 'solid', unlock: { type: 'default' }, rarity: 'common' },
    { id: 'violet', name: 'Violet', c1: '#8b5cff', c2: '#d7c2ff', pattern: 'ring', unlock: { type: 'level', value: 2 }, rarity: 'common' },
    { id: 'sunrise', name: 'Sunrise', c1: '#ff8a1f', c2: '#ffe27a', pattern: 'core', unlock: { type: 'level', value: 3 }, rarity: 'rare' },
    { id: 'glacier', name: 'Glacier', c1: '#5ad1e6', c2: '#ffffff', pattern: 'stripes', unlock: { type: 'level', value: 5 }, rarity: 'rare' },
    { id: 'toxic', name: 'Toxic', c1: '#a6ff00', c2: '#2b6b00', pattern: 'star', unlock: { type: 'level', value: 7 }, rarity: 'rare' },
    { id: 'magma', name: 'Magma', c1: '#ff3d00', c2: '#ffd000', pattern: 'spiral', unlock: { type: 'level', value: 10 }, rarity: 'epic' },
    { id: 'abyss', name: 'Abyss', c1: '#2433ff', c2: '#00f0ff', pattern: 'ring', unlock: { type: 'level', value: 14 }, rarity: 'epic' },
    { id: 'bubblegum', name: 'Bubblegum', c1: '#ff6ad5', c2: '#ffe0f7', pattern: 'core', unlock: { type: 'shards', value: 120 }, rarity: 'rare' },
    { id: 'mint', name: 'Mint Chip', c1: '#3ef0b0', c2: '#173d33', pattern: 'stripes', unlock: { type: 'shards', value: 200 }, rarity: 'rare' },
    { id: 'phantom', name: 'Phantom', c1: '#b8c4ff', c2: '#ffffff', pattern: 'spiral', unlock: { type: 'shards', value: 350 }, rarity: 'epic' },
    { id: 'aurora', name: 'Aurora', c1: '#00e5a0', c2: '#b06bff', pattern: 'stripes', unlock: { type: 'achievement', value: 'titan' }, rarity: 'epic' },
    { id: 'monarch', name: 'Monarch', c1: '#ffc400', c2: '#fff4b0', pattern: 'star', unlock: { type: 'achievement', value: 'crown' }, rarity: 'legendary' },
    { id: 'reaper', name: 'Reaper', c1: '#3a3a5c', c2: '#ff2e63', pattern: 'core', unlock: { type: 'achievement', value: 'hunter' }, rarity: 'epic' },
    { id: 'prism', name: 'Prism', c1: '#ff4f7b', c2: '#ffffff', pattern: 'rainbow', unlock: { type: 'premium', value: 'skin_prism' }, rarity: 'legendary' },
    { id: 'nebula', name: 'Nebula', c1: '#6a00ff', c2: '#ff9cf5', pattern: 'spiral', unlock: { type: 'premium', value: 'skin_nebula' }, rarity: 'legendary' },
  ];

  const BOT_NAMES = [
    'Zibbo', 'NovaKid', 'Quark', 'Mochi', 'Pixelpup', 'Lumen', 'Bloop', 'Orbit Ollie', 'Fizz', 'Kiwi', 'Dr. Glow',
    'Nebby', 'Sprocket', 'Tofu', 'Zap', 'Comet Carl', 'Marble', 'Puddle', 'Echo', 'Volt', 'Juno', 'Pebble',
    'Biscuit', 'Nyx', 'Hexa', 'Moxie', 'Ripple', 'Wisp', 'Tango', 'Yeti', 'Zorp', 'Neon Nana', 'Gumdrop', 'Sol',
    'Vex', 'Dusk', 'Pip', 'Rook', 'Ozzy', 'Blitz', 'Luna Lux', 'Squish', 'Cosmo', 'Taro', 'xX_glow_Xx',
    'imnotabot', 'ProOrb', 'snack time', 'Bean', 'Grumble', 'Waffles', 'Noodle', 'sparkle', 'Captain Orb',
    'Dumpling', 'Twinkle', 'Bonk', 'Glimmer', 'Jelly', 'Mr. Round', 'orbit_queen', 'lilmoon', 'Fuzzy',
    'Pocket', 'Saturnine', 'Nimbus', 'Boba', 'Zigzag', 'Quasar', 'Peanut', 'Doodle', 'Kaboom',
  ];

  OB.Cosmetics = {
    SKINS,
    BOT_NAMES,
    get(id) {
      return SKINS.find((s) => s.id === id) || SKINS[0];
    },
    randomBotSkin() {
      return SKINS[Math.floor(Math.random() * SKINS.length)];
    },
    unlockLabel(skin) {
      const u = skin.unlock;
      switch (u.type) {
        case 'default': return 'Free';
        case 'level': return 'Reach level ' + u.value;
        case 'achievement': {
          const a = OB.Achievements && OB.Achievements.get(u.value);
          return 'Trophy: ' + (a ? a.name : u.value);
        }
        case 'shards': return u.value + ' shards';
        case 'premium': return 'Supporter skin';
        default: return '';
      }
    },
  };
})();
