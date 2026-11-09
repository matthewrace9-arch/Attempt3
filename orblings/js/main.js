/* Boot: load profile, wire UI to the engine, lock down mobile browser
 * gestures (pinch zoom, pull-to-refresh, double-tap zoom). */
(function () {
  const OB = window.OB;

  // ---- mobile browser hardening
  const stop = (e) => e.preventDefault();
  document.addEventListener('gesturestart', stop, { passive: false });
  document.addEventListener('gesturechange', stop, { passive: false });
  document.addEventListener(
    'touchmove',
    (e) => {
      // allow scrolling inside menus/panels only
      if (!e.target.closest || !e.target.closest('.screen.active')) e.preventDefault();
    },
    { passive: false }
  );
  // unlock audio on the very first interaction (iOS requirement)
  const unlock = () => OB.Audio.unlock();
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('touchend', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  OB.Profile.load();
  const canvas = document.getElementById('game');
  const game = new OB.Game(canvas);
  OB.game = game;

  OB.UI.init({
    onPlay: () => game.startRun(),
    onAgain: () => game.startRun(),
    onMenu: () => game.toMenu(),
    onPause: () => game.pause(),
    onResume: () => game.resume(),
    onQuit: () => game.quit(),
    onAbility: () => {
      if (game.state === 'playing') game.input.abilityQueued = true;
    },
    onSettingsChange: () => game.applySettings(),
    onReward: () => {
      OB.Monetization.ads.showRewarded('double_shards').then((res) => {
        if (res.rewarded) {
          OB.Monetization.wallet.earn(OB.UI.rewardShards || 0, 'rewarded_ad');
          document.getElementById('btn-reward').classList.add('hidden');
          OB.UI.toast('💎', 'Shards doubled!');
          OB.UI.refreshMenu();
        }
      });
    },
  });

  // Escape / P toggles pause on desktop
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'escape' || k === 'p') {
      if (game.state === 'playing') game.pause();
      else if (game.state === 'paused' && !OB.UI.panelOpen) game.resume();
      else if (OB.UI.panelOpen) OB.UI.closePanel();
    }
  });

  // Android back button / browser back closes panels instead of leaving
  window.addEventListener('popstate', () => {
    if (OB.UI.panelOpen) OB.UI.closePanel();
    else if (game.state === 'playing') game.pause();
    history.pushState(null, '', location.href);
  });
  try { history.pushState(null, '', location.href); } catch (e) {}

  // Offline support when served over http(s)
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
