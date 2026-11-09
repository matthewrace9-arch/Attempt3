/* Haptic feedback via the Vibration API (Android Chrome/Firefox). iOS Safari
 * does not expose vibration to web pages; calls become harmless no-ops. */
(function () {
  const OB = (window.OB = window.OB || {});
  const can = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  let last = 0;

  function buzz(pattern, minGap = 40) {
    if (!can || !OB.Haptics.enabled) return;
    const now = performance.now();
    if (now - last < minGap) return;
    last = now;
    try { navigator.vibrate(pattern); } catch (e) {}
  }

  OB.Haptics = {
    enabled: true,
    supported: can,
    tick: () => buzz(8, 90),
    light: () => buzz(15),
    medium: () => buzz(30),
    heavy: () => buzz([40, 30, 60]),
    success: () => buzz([20, 40, 20, 40, 50], 0),
    death: () => buzz([80, 50, 160], 0),
  };
})();
