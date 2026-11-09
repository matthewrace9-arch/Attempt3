/* Small math / color / formatting helpers. */
(function () {
  const OB = (window.OB = window.OB || {});
  const TAU = Math.PI * 2;

  const hexCache = {};
  function hexToRgb(hex) {
    if (hexCache[hex]) return hexCache[hex];
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    const out = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    hexCache[hex] = out;
    return out;
  }

  OB.U = {
    TAU,
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    rand: (a, b) => a + Math.random() * (b - a),
    randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    dist2: (ax, ay, bx, by) => {
      const dx = ax - bx, dy = ay - by;
      return dx * dx + dy * dy;
    },
    angDiff(a, b) {
      let d = (b - a) % TAU;
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      return d;
    },
    randInDisk(R) {
      const a = Math.random() * TAU, r = R * Math.sqrt(Math.random());
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    },
    hexToRgb,
    rgba(hex, a) {
      const [r, g, b] = hexToRgb(hex);
      return `rgba(${r},${g},${b},${a})`;
    },
    mix(hexA, hexB, t) {
      const a = hexToRgb(hexA), b = hexToRgb(hexB);
      const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
      return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
    },
    formatTime(s) {
      s = Math.max(0, Math.floor(s));
      return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    },
    formatNum(n) {
      n = Math.floor(n);
      if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
      if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
      return n.toLocaleString('en-US');
    },
    escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },
    easeOutBack(t) {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
  };
})();
