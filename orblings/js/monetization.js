/* Monetization-ready seams. Nothing intrusive ships in this build:
 *  - Wallet: soft currency ("shards"), earned by playing, spent on cosmetics.
 *  - Ads: rewarded-ad interface. No provider is registered, so every
 *         placement reports unavailable and the UI hides its button.
 *  - Store: premium cosmetic SKUs. No provider registered → purchase reports
 *           "store unavailable". Register a provider (e.g. a Capacitor IAP
 *           plugin, Stripe, Google Play Billing) with registerStoreProvider().
 *  - BattlePass: data-driven season tiers keyed off account XP (disabled).
 * Design rule: everything sold is cosmetic. Nothing changes gameplay stats.
 */
(function () {
  const OB = (window.OB = window.OB || {});

  const wallet = {
    get balance() {
      return OB.Profile.data ? OB.Profile.data.shards : 0;
    },
    earn(amount, reason) {
      OB.Profile.data.shards += Math.max(0, Math.floor(amount));
      OB.Profile.save();
      OB.Monetization.emit('wallet', { amount, reason });
    },
    spend(amount) {
      if (OB.Profile.data.shards < amount) return false;
      OB.Profile.data.shards -= amount;
      OB.Profile.save();
      OB.Monetization.emit('wallet', { amount: -amount });
      return true;
    },
  };

  const ads = {
    provider: null,
    /** placements: 'double_shards' (game over), 'bonus_spin' (future) */
    isRewardedAvailable(placement) {
      return !!(this.provider && this.provider.isReady && this.provider.isReady(placement));
    },
    /** @returns Promise<{rewarded:boolean, reason?:string}> */
    showRewarded(placement) {
      if (!this.isRewardedAvailable(placement)) return Promise.resolve({ rewarded: false, reason: 'unavailable' });
      OB.Audio.suspend();
      return Promise.resolve(this.provider.show(placement))
        .then((res) => ({ rewarded: !!(res && res.rewarded) }))
        .catch(() => ({ rewarded: false, reason: 'error' }))
        .finally(() => OB.Audio.resume());
    },
  };

  const store = {
    provider: null,
    catalog: [
      { sku: 'skin_prism', type: 'skin', grants: 'prism', price: '$1.99' },
      { sku: 'skin_nebula', type: 'skin', grants: 'nebula', price: '$1.99' },
      { sku: 'shards_500', type: 'currency', grants: 500, price: '$2.99' },
      { sku: 'season_pass_s1', type: 'battlepass', grants: 's1', price: '$4.99' },
    ],
    isAvailable() {
      return !!this.provider;
    },
    getProduct(sku) {
      return this.catalog.find((p) => p.sku === sku);
    },
    /** @returns Promise<{ok:boolean, reason?:string}> */
    purchase(sku) {
      const product = this.getProduct(sku);
      if (!product) return Promise.resolve({ ok: false, reason: 'unknown_sku' });
      if (!this.provider) return Promise.resolve({ ok: false, reason: 'store_unavailable' });
      return Promise.resolve(this.provider.purchase(sku)).then((res) => {
        if (!res || !res.ok) return { ok: false, reason: (res && res.reason) || 'cancelled' };
        store.fulfil(product);
        return { ok: true };
      });
    },
    fulfil(product) {
      if (product.type === 'skin') OB.Profile.grantSkin(product.grants);
      else if (product.type === 'currency') wallet.earn(product.grants, 'purchase');
      else if (product.type === 'battlepass') {
        OB.Profile.data.battlePass = OB.Profile.data.battlePass || {};
        OB.Profile.data.battlePass[product.grants] = true;
        OB.Profile.save();
      }
    },
  };

  const battlePass = {
    enabled: false,
    season: 's1',
    xpPerTier: 400,
    tiers: [
      { tier: 1, free: { shards: 25 }, premium: { shards: 75 } },
      { tier: 2, free: { shards: 25 }, premium: { skin: 'nebula' } },
      { tier: 3, free: { shards: 50 }, premium: { shards: 150 } },
    ],
    tierFor(totalXP) {
      return Math.min(this.tiers.length, Math.floor(totalXP / this.xpPerTier));
    },
  };

  const listeners = {};
  OB.Monetization = {
    wallet, ads, store, battlePass,
    registerAdsProvider(p) { ads.provider = p; },
    registerStoreProvider(p) { store.provider = p; },
    on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); },
    emit(evt, data) { (listeners[evt] || []).forEach((fn) => fn(data)); },
  };
})();
