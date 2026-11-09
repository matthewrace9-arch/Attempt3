/* DOM UI: screens, HUD, toasts, skins, leaderboard, trophies, settings. */
(function () {
  const OB = (window.OB = window.OB || {});
  const U = OB.U;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // AI legends for the offline league (clearly labelled in the UI)
  const RIVALS = [
    ['Quasar', 6420], ['lilmoon', 5180], ['Captain Orb', 4410], ['orbit_queen', 3720], ['Nimbus', 3150],
    ['Zorp', 2680], ['Mochi', 2240], ['Volt', 1890], ['Echo', 1560], ['Pebble', 1280], ['Wisp', 1020],
    ['Tofu', 840], ['Bean', 660], ['Kiwi', 490], ['Pip', 330], ['Squish', 190],
  ];

  const UI = {
    handlers: {},
    panelStack: [],
    hud: {},
    lastLB: 0,
    lastMini: 0,
    lastScore: -1,
    lastPower: -1,
    previewCtx: null,

    init(handlers) {
      this.handlers = handlers;
      this.hud = {
        root: $('#hud'),
        score: $('#hud-score'),
        power: $('#hud-power'),
        level: $('#hud-level'),
        xpfill: $('#xpfill'),
        lb: $('#mini-lb'),
        ability: $('#btn-ability'),
        minimap: $('#minimap'),
        hint: $('#hint'),
      };
      this.miniCtx = this.hud.minimap.getContext('2d');
      this.previewCtx = $('#skin-preview').getContext('2d');
      $('#version').textContent = OB.VERSION;

      const click = (el, fn) => el.addEventListener('click', (e) => { OB.Audio.unlock(); OB.Audio.click(); fn(e); });

      // menu
      const nameInput = $('#name-input');
      nameInput.value = OB.Profile.name;
      nameInput.addEventListener('change', () => OB.Profile.setName(nameInput.value));
      nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { nameInput.blur(); this.handlers.onPlay(); } });
      click($('#btn-play'), () => { OB.Profile.setName(nameInput.value); nameInput.blur(); this.handlers.onPlay(); });
      click($('#skin-preview-btn'), () => this.openPanel('skins'));
      $$('[data-open]').forEach((b) => click(b, () => this.openPanel(b.dataset.open)));
      $$('[data-back]').forEach((b) => click(b, () => this.closePanel()));

      // HUD
      const ab = this.hud.ability;
      ab.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        OB.Audio.unlock();
        ab.classList.add('pressed');
        this.handlers.onAbility();
      });
      const unpress = () => ab.classList.remove('pressed');
      ab.addEventListener('pointerup', unpress);
      ab.addEventListener('pointercancel', unpress);
      ab.addEventListener('pointerleave', unpress);
      click($('#btn-pause'), () => this.handlers.onPause());

      // pause / over
      click($('#btn-resume'), () => this.handlers.onResume());
      click($('#btn-quit'), () => this.handlers.onQuit());
      click($('#btn-again'), () => this.handlers.onAgain());
      click($('#btn-menu'), () => this.handlers.onMenu());
      click($('#btn-reward'), () => this.handlers.onReward());

      this.initSettings();
      this.refreshMenu();
    },

    // ---------------------------------------------------------------- screens
    showMenu() {
      this.hideOverlays();
      this.closeAllPanels();
      this.hud.root.classList.add('hidden');
      $('#screen-menu').classList.add('active');
      this.refreshMenu();
    },
    showHUD() {
      this.hideOverlays();
      this.closeAllPanels();
      $('#screen-menu').classList.remove('active');
      this.hud.root.classList.remove('hidden');
      this.lastScore = -1; this.lastPower = -1; this.lastLB = 0;
      this.hud.lb.innerHTML = '';
    },
    showOverlay(id) {
      this.hideOverlays();
      $('#screen-' + id).classList.add('active');
    },
    hideOverlays() {
      $('#screen-pause').classList.remove('active');
      $('#screen-over').classList.remove('active');
    },
    openPanel(name) {
      const el = $('#screen-' + name);
      if (!el) return;
      if (name === 'skins') this.renderSkins();
      if (name === 'leaderboard') this.renderLeaderboard();
      if (name === 'achievements') this.renderAchievements();
      if (name === 'settings') this.syncSettings();
      el.classList.add('active');
      el.scrollTop = 0;
      this.panelStack = this.panelStack.filter((n) => n !== name);
      this.panelStack.push(name);
    },
    closePanel() {
      const name = this.panelStack.pop();
      if (name) $('#screen-' + name).classList.remove('active');
      this.refreshMenu();
    },
    closeAllPanels() {
      while (this.panelStack.length) $('#screen-' + this.panelStack.pop()).classList.remove('active');
    },
    get panelOpen() {
      return this.panelStack.length > 0;
    },

    // ---------------------------------------------------------------- menu
    refreshMenu() {
      const d = OB.Profile.data;
      const li = OB.Profile.levelInfo(d.totalXP);
      $('#menu-level').textContent = li.level;
      $('#menu-xpfill').style.width = (li.frac * 100).toFixed(1) + '%';
      $('#menu-shards').textContent = U.formatNum(d.shards);
      $$('.shards-val').forEach((e) => (e.textContent = U.formatNum(d.shards)));
      $('#menu-best').textContent = U.formatNum(d.bestScore);
      $('#skin-preview-name').textContent = OB.Cosmetics.get(d.selectedSkin).name;
    },

    drawPreview(time) {
      const ctx = this.previewCtx;
      const skin = OB.Cosmetics.get(OB.Profile.data.selectedSkin);
      ctx.clearRect(0, 0, 200, 200);
      UI.drawSkinIcon(ctx, 100, 100 + Math.sin(time * 2) * 4, 46, skin, time, Math.sin(time * 0.7) * 0.8);
    },

    drawSkinIcon(ctx, x, y, r, skin, time, heading) {
      const glow = OB.Renderer.glowSprite(skin.c1, false);
      ctx.globalAlpha = 0.6;
      ctx.drawImage(glow, x - r * 1.9, y - r * 1.9, r * 3.8, r * 3.8);
      ctx.globalAlpha = 1;
      OB.Renderer.drawBody(ctx, x, y, r, skin, { time, heading: heading || 0.4, blink: (time % 4) > 3.88 });
      // orbiting moons
      const n = 3;
      for (let i = 0; i < n; i++) {
        const a = time * 2 + (i / n) * U.TAU;
        const mx = x + Math.cos(a) * r * 1.45, my = y + Math.sin(a) * r * 1.45;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(mx, my, r * 0.16, 0, U.TAU); ctx.fill();
        ctx.fillStyle = skin.pattern === 'rainbow' ? `hsl(${(time * 60) % 360},95%,62%)` : skin.c1;
        ctx.beginPath(); ctx.arc(mx, my, r * 0.09, 0, U.TAU); ctx.fill();
      }
    },

    // ---------------------------------------------------------------- skins
    renderSkins() {
      const grid = $('#skin-grid');
      grid.innerHTML = '';
      const P = OB.Profile;
      for (const skin of OB.Cosmetics.SKINS) {
        const unlocked = P.isSkinUnlocked(skin.id);
        const card = document.createElement('div');
        card.className = 'skin-card' + (unlocked ? '' : ' locked') + (P.data.selectedSkin === skin.id ? ' selected' : '');
        card.innerHTML = `<span class="rar ${skin.rarity}">${skin.rarity}</span><canvas width="152" height="152"></canvas><div class="sk-name">${U.escapeHtml(skin.name)}</div>`;
        const ctx = card.querySelector('canvas').getContext('2d');
        UI.drawSkinIcon(ctx, 76, 76, 38, skin, 1.2, 0.5);
        if (!unlocked) {
          if (skin.unlock.type === 'shards') {
            const btn = document.createElement('button');
            btn.className = 'buy';
            btn.innerHTML = `<i class="ico-shard"></i>${skin.unlock.value}`;
            btn.disabled = P.data.shards < skin.unlock.value;
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              OB.Audio.unlock();
              if (P.buySkinWithShards(skin.id)) {
                OB.Audio.achievement();
                OB.Haptics.success();
                P.selectSkin(skin.id);
                this.toast('🎨', 'Unlocked ' + skin.name + '!');
                this.renderSkins();
                this.refreshMenu();
              }
            });
            card.appendChild(btn);
          } else {
            const lock = document.createElement('div');
            lock.className = 'sk-lock';
            lock.textContent = '🔒 ' + OB.Cosmetics.unlockLabel(skin);
            card.appendChild(lock);
          }
        } else {
          const lbl = document.createElement('div');
          lbl.className = 'sk-lock';
          lbl.textContent = P.data.selectedSkin === skin.id ? 'Equipped' : 'Tap to equip';
          card.appendChild(lbl);
        }
        card.addEventListener('click', () => {
          OB.Audio.unlock();
          if (P.isSkinUnlocked(skin.id)) {
            OB.Audio.click();
            OB.Haptics.light();
            P.selectSkin(skin.id);
            this.renderSkins();
            this.refreshMenu();
          } else if (skin.unlock.type === 'premium') {
            OB.Monetization.store.purchase(skin.unlock.value).then((res) => {
              if (res.ok) { P.selectSkin(skin.id); this.renderSkins(); this.refreshMenu(); this.toast('💎', 'Thanks for supporting!'); }
              else if (res.reason === 'store_unavailable') this.toast('💎', 'Supporter skins', 'The store opens in a future update.');
            });
          } else {
            this.toast('🔒', skin.name, OB.Cosmetics.unlockLabel(skin));
          }
        });
        grid.appendChild(card);
      }
    },

    // ---------------------------------------------------------------- leaderboard
    renderLeaderboard() {
      const d = OB.Profile.data;
      const myName = d.name || 'You';
      const rows = RIVALS.map(([name, score]) => ({ name, score, me: false }));
      d.runs.slice(0, 10).forEach((r) => rows.push({ name: myName, score: r.score, me: true }));
      rows.sort((a, b) => b.score - a.score);
      const bestIdx = rows.findIndex((r) => r.me);
      const list = $('#lb-list');
      list.innerHTML = '';
      rows.slice(0, 25).forEach((r, i) => {
        const li = document.createElement('li');
        if (r.me) li.className = 'me';
        li.innerHTML = `<span class="pos">${i + 1}</span><span class="nm">${U.escapeHtml(r.name)}${r.me ? ' (you)' : ''}</span><span class="sc">${U.formatNum(r.score)}</span>`;
        list.appendChild(li);
      });
      const yr = $('#lb-your-rank');
      if (bestIdx >= 0) {
        const next = rows[bestIdx - 1];
        yr.innerHTML = `Your rank <b>#${bestIdx + 1}</b> of ${rows.length}` +
          (next ? `<div style="font-size:14px;font-weight:500;margin-top:4px">${U.formatNum(next.score - rows[bestIdx].score + 1)} more to pass ${U.escapeHtml(next.name)}</div>` : '<div style="font-size:14px;margin-top:4px">You rule the league 👑</div>');
      } else {
        yr.innerHTML = 'Play a round to get ranked!';
      }
    },

    // ---------------------------------------------------------------- achievements
    renderAchievements() {
      const d = OB.Profile.data;
      const list = $('#ach-list');
      list.innerHTML = '';
      let done = 0;
      for (const a of OB.Achievements.LIST) {
        const got = !!d.achievements[a.id];
        if (got) done++;
        const li = document.createElement('li');
        if (got) li.className = 'done';
        li.innerHTML = `<div class="a-ico">${a.icon}</div><div><div class="a-name">${a.name}</div><div class="a-desc">${a.desc}</div></div><div class="a-rew">${got ? '✅' : `<i class="ico-shard"></i>${a.shards}`}</div>`;
        list.appendChild(li);
      }
      $('#ach-count').textContent = done + '/' + OB.Achievements.LIST.length;
      const s = d.stats;
      $('#stats-strip').innerHTML =
        `<div><b>${U.formatNum(s.games)}</b><span>Rounds</span></div>` +
        `<div><b>${U.formatNum(s.kills)}</b><span>Takedowns</span></div>` +
        `<div><b>${U.formatTime(s.timePlayed)}</b><span>Played</span></div>`;
    },

    // ---------------------------------------------------------------- settings
    initSettings() {
      const S = () => OB.Profile.data.settings;
      const bindToggle = (id, key) => {
        const el = $(id);
        el.addEventListener('change', () => {
          S()[key] = el.checked;
          OB.Profile.save();
          OB.Audio.unlock();
          OB.Audio.click();
          this.handlers.onSettingsChange();
        });
      };
      bindToggle('#set-sound', 'sound');
      bindToggle('#set-music', 'music');
      bindToggle('#set-haptics', 'haptics');
      bindToggle('#set-left', 'leftHanded');
      if (!OB.Haptics.supported) $('#row-haptics').querySelector('span').textContent = 'Vibration (not supported on this device)';
      const bindSeg = (id, key) => {
        $$(id + ' button').forEach((b) =>
          b.addEventListener('click', () => {
            S()[key] = b.dataset.val;
            OB.Profile.save();
            OB.Audio.unlock();
            OB.Audio.click();
            this.syncSettings();
            this.handlers.onSettingsChange();
          })
        );
      };
      bindSeg('#set-controls', 'controls');
      bindSeg('#set-quality', 'quality');
      $('#btn-fullscreen').addEventListener('click', () => UI.toggleFullscreen());
      $('#btn-reset').addEventListener('click', () => {
        if (window.confirm('Reset all progress, skins and trophies? This cannot be undone.')) {
          OB.Profile.reset();
          $('#name-input').value = '';
          this.toast('🧹', 'Progress reset');
          this.refreshMenu();
        }
      });
    },
    syncSettings() {
      const s = OB.Profile.data.settings;
      $('#set-sound').checked = s.sound;
      $('#set-music').checked = s.music;
      $('#set-haptics').checked = s.haptics;
      $('#set-left').checked = s.leftHanded;
      $$('#set-controls button').forEach((b) => b.classList.toggle('on', b.dataset.val === s.controls));
      $$('#set-quality button').forEach((b) => b.classList.toggle('on', b.dataset.val === s.quality));
    },

    toggleFullscreen(forceOn) {
      const d = document, el = d.documentElement;
      const isFs = d.fullscreenElement || d.webkitFullscreenElement;
      try {
        if (!isFs || forceOn) {
          if (isFs) return;
          const req = el.requestFullscreen || el.webkitRequestFullscreen;
          if (req) {
            const p = req.call(el, { navigationUI: 'hide' });
            if (p && p.then) p.then(() => { try { screen.orientation.lock('portrait').catch(() => {}); } catch (e) {} }).catch(() => {});
          } else if (!forceOn) {
            this.toast('📱', 'Fullscreen', 'Use Share → Add to Home Screen for fullscreen.');
          }
        } else {
          (d.exitFullscreen || d.webkitExitFullscreen).call(d);
        }
      } catch (e) {}
    },

    // ---------------------------------------------------------------- HUD
    updateHUD(g) {
      const h = this.hud;
      const p = g.player;
      const score = Math.floor(p.score);
      if (score !== this.lastScore) {
        h.score.textContent = U.formatNum(score);
        if (score - this.lastScore >= 20 && this.lastScore >= 0) {
          h.score.classList.remove('bump');
          void h.score.offsetWidth;
          h.score.classList.add('bump');
        }
        this.lastScore = score;
      }
      const power = Math.floor(p.mass);
      if (power !== this.lastPower) { h.power.textContent = U.formatNum(power); this.lastPower = power; }
      const li = g.levelInfo;
      if (h.level.textContent !== String(li.level)) h.level.textContent = li.level;
      h.xpfill.style.width = (li.frac * 100).toFixed(1) + '%';

      const cdFrac = p.cooldown > 0 ? 1 - p.cooldown / OB.CONFIG.PULSE.cooldown : 1;
      h.ability.style.setProperty('--cd', cdFrac.toFixed(3));
      h.ability.classList.toggle('ready', p.cooldown <= 0);

      const now = performance.now();
      if (now - this.lastLB > 300) {
        this.lastLB = now;
        this.renderMiniLB(g.world, p);
      }
      if (now - this.lastMini > 150) {
        this.lastMini = now;
        this.drawMinimap(g.world, p);
      }
    },

    renderMiniLB(world, player) {
      const lb = world.leaderboard();
      const myRank = lb.indexOf(player) + 1;
      let html = '';
      const top = lb.slice(0, 5);
      top.forEach((o, i) => {
        html += `<li class="${o === player ? 'me' : ''}"><span class="r">${i + 1}</span><span class="n">${U.escapeHtml(o.name)}</span><span class="m">${U.formatNum(o.mass)}</span></li>`;
      });
      if (myRank > 5) {
        html += `<li class="sep">···</li><li class="me"><span class="r">${myRank}</span><span class="n">${U.escapeHtml(player.name)}</span><span class="m">${U.formatNum(player.mass)}</span></li>`;
      }
      this.hud.lb.innerHTML = html;
    },

    drawMinimap(world, player) {
      const ctx = this.miniCtx;
      const S = 168, c = S / 2, R = c - 6;
      const k = R / world.R;
      ctx.clearRect(0, 0, S, S);
      ctx.strokeStyle = 'rgba(255,120,200,0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(c, c, R, 0, U.TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(140,200,255,0.12)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(c, c, R * 0.33, 0, U.TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(c, c, R * 0.66, 0, U.TAU); ctx.stroke();
      // big orblings are visible from afar
      for (const o of world.orblings) {
        if (o === player || o.mass < 120) continue;
        const danger = o.mass >= player.mass * OB.CONFIG.EAT_RATIO;
        ctx.fillStyle = danger ? 'rgba(255,92,124,0.85)' : 'rgba(125,255,176,0.7)';
        ctx.beginPath(); ctx.arc(c + o.x * k, c + o.y * k, U.clamp(o.r * k * 2.2, 3, 9), 0, U.TAU); ctx.fill();
      }
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = player.skin.c1;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(c + player.x * k, c + player.y * k, 6, 0, U.TAU); ctx.fill(); ctx.stroke();
    },

    showHint(show) {
      const h = this.hud.hint;
      if (show) {
        const desktop = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        if (desktop) {
          $('#hint-move').textContent = 'Steer with your mouse (or WASD)';
          $('#hint-pulse').innerHTML = 'Moons hurt rivals · <b>SPACE</b> to PULSE';
        }
        h.classList.remove('hidden', 'fade');
      }
      else if (!h.classList.contains('hidden')) {
        h.classList.add('fade');
        setTimeout(() => h.classList.add('hidden'), 500);
      }
    },

    pauseStats(p, time) {
      $('#pause-stats').innerHTML = `<span>Score <b>${U.formatNum(p.score)}</b></span><span>Power <b>${U.formatNum(p.mass)}</b></span><span>Time <b>${U.formatTime(time)}</b></span>`;
    },

    // ---------------------------------------------------------------- toasts
    toast(icon, title, sub, cls) {
      const t = document.createElement('div');
      t.className = 'toast' + (cls ? ' ' + cls : '');
      t.innerHTML = `<span class="t-ico">${icon}</span><div><b>${U.escapeHtml(title)}</b>${sub ? `<small>${U.escapeHtml(sub)}</small>` : ''}</div>`;
      const box = $('#toasts');
      box.appendChild(t);
      while (box.children.length > 3) box.removeChild(box.firstChild);
      setTimeout(() => t.remove(), 3100);
    },

    // ---------------------------------------------------------------- game over
    showGameOver(run, summary, killerName, how) {
      this.showOverlay('over');
      $('#over-kicker').textContent = how === 'quit' ? 'MATCH OVER' : how === 'moon' ? 'SHATTERED!' : 'ABSORBED!';
      $('#over-by').textContent = how === 'quit' ? 'You left the arena' : 'by ' + (killerName || 'a rival');
      $('#over-rank').textContent = '#' + run.rank;
      $('#over-peak').textContent = '#' + run.peakRank;
      $('#over-kills').textContent = run.kills;
      $('#over-time').textContent = U.formatTime(run.time);
      $('#over-best').classList.toggle('hidden', !summary.newBest);
      $('#over-xp-gain').textContent = '+' + summary.xp + ' XP';
      $('#over-shards').textContent = '+' + summary.shards;
      $('#btn-reward').classList.toggle('hidden', !OB.Monetization.ads.isRewardedAvailable('double_shards'));
      this.rewardShards = summary.shards;

      const unlocks = $('#over-unlocks');
      unlocks.innerHTML = '';
      const addPill = (ico, text, delay) => {
        const d = document.createElement('div');
        d.className = 'unlock-pill';
        d.style.animationDelay = delay + 's';
        d.innerHTML = `<span class="u-ico">${ico}</span><span>${text}</span>`;
        unlocks.appendChild(d);
      };
      let delay = 0.8;
      if (summary.levelsGained > 0) { addPill('⬆️', `<b>Level up!</b> You reached level ${summary.after.level}`, delay); delay += 0.15; }
      summary.unlockedSkins.forEach((s) => { addPill('🎨', `New skin unlocked: <b>${U.escapeHtml(s.name)}</b>`, delay); delay += 0.15; });
      summary.achievements.forEach((a) => { addPill(a.icon, `Trophy: <b>${a.name}</b> (+${a.shards} shards)`, delay); delay += 0.15; });

      // animated count-up for score + XP bar
      const scoreEl = $('#over-score');
      const target = Math.floor(run.score);
      const levelEl = $('#over-level');
      const fill = $('#over-xpfill');
      const start = performance.now();
      const dur = 1100;
      const b = summary.before;
      const totalBefore = OB.Profile.data.totalXP - summary.xp;
      let lastLevel = b.level, lastTick = 0;
      levelEl.textContent = b.level;
      fill.style.width = (b.frac * 100) + '%';
      const tick = (now) => {
        const t = Math.min(1, (now - start) / dur);
        const e = 1 - Math.pow(1 - t, 3);
        scoreEl.textContent = U.formatNum(target * e);
        const li = OB.Profile.levelInfo(totalBefore + summary.xp * e);
        fill.style.width = (li.frac * 100).toFixed(1) + '%';
        if (li.level !== lastLevel) {
          lastLevel = li.level;
          levelEl.textContent = li.level;
          OB.Audio.levelUp();
          OB.Haptics.success();
        } else if (now - lastTick > 70 && t < 1) {
          lastTick = now;
          OB.Audio.countUp();
        }
        if (t < 1 && $('#screen-over').classList.contains('active')) requestAnimationFrame(tick);
        else { scoreEl.textContent = U.formatNum(target); }
      };
      requestAnimationFrame(tick);
    },
  };

  OB.UI = UI;
})();
