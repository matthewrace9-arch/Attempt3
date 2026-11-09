# ORBLINGS.io

*Grow. Orbit. Outshine.*

A mobile-first, portrait, one-thumb `.io` arena game. Pure HTML5 Canvas + vanilla
JavaScript — no engine, no build step, no dependencies.

## The game in 10 seconds

You are an **orbling**: a small glowing creature with **moons** circling you.

- **Drag anywhere** to move (floating joystick). Desktop: mouse or WASD.
- **Eat glowing energy** to grow. Every 45 power earns another moon (up to 8).
- **Bigger orblings absorb smaller ones** on contact (you need ~18% more power).
- **Moons are weapons and shields.** A moon that hits a rival chips off energy, which
  spills out for anyone to grab. Two moons that collide shatter each other.
- **PULSE** (big button): flings your moons out to 2.5× their orbit and spins them
  faster, gives you a speed burst, and shoves nearby smaller orblings away. You can use
  it to strike, chase, or escape. 6.5 s cooldown.
- **Name colours tell you what to do:** green means you can absorb them, red means
  run. Red arrows at the screen edge warn you about off-screen hunters.

Rounds usually last 2–5 minutes. Rivals get bigger and sharper as a run goes on, and
very large orblings slowly lose mass so the leader can always be dethroned.

## Run it

**Easiest:** open `index.html` directly in a browser. All scripts are classic
`<script>` files, so it works from `file://`.

**On your phone (same Wi-Fi):**

```bash
node orblings/serve.js          # zero-dependency static server on :8080
# then open the printed http://192.168.x.x:8080 URL on your phone
```

**Publish it:** upload the `orblings/` folder to any static host (GitHub Pages,
Netlify, Cloudflare Pages, Vercel, itch.io as an HTML game). Over HTTPS you also get
offline play (service worker) and "Add to Home Screen" fullscreen (web manifest).

## Screens

| Screen | Contents |
|---|---|
| Main menu | Animated logo, live AI match in the background, animated skin preview, name, PLAY, best score, level and XP, shards, Skins / Ranks / Trophies / Settings |
| Game HUD | Score, power, level and live XP bar, minimap, top-5 mini leaderboard plus your rank, PULSE button with cooldown ring, pause |
| Game over | Killer, final score (count-up), arena rank, best rank, takedowns, time, animated XP bar with level-ups, shards, new unlocks and trophies, Play Again |
| Leaderboard | Offline league: your best runs ranked against AI legends, your rank, and the gap to the next spot |
| Trophies | 12 achievements with shard rewards and lifetime stats |
| Skins | 17 cosmetic skins: level / trophy / shard / supporter unlocks |
| Settings | Sound, music, vibration, left-handed PULSE, joystick or follow-finger controls, graphics (Auto/High/Battery), fullscreen, reset |

## Progression

- **XP** comes from score, takedowns, moon hits and survival time. It counts live during
  a run (top XP bar, mid-run level-up toasts) and is saved when the run ends.
- **Levels:** XP to the next level is `100 + 65 × (level − 1)`.
- **Shards** are the soft currency. You earn them from runs and trophies and spend them
  on skins.
- **Skins** unlock by level (2, 3, 5, 7, 10, 14), by trophy (Hunter, Titan, Crown), with
  shards, or as supporter (premium) skins.
- **Achievements** are checked live during a run and again at the end.
- Everything is saved to `localStorage` in a versioned schema (`orblings.save.v1`) with a
  migration function. If storage is blocked, it falls back to memory and never crashes.

## Architecture

```
orblings/
├── index.html            screens + HUD markup, script order
├── css/style.css         all UI styling, safe-area insets, responsive rules
├── js/
│   ├── config.js         every tuning constant (shared by client and a future server)
│   ├── utils.js          math / colour / format helpers
│   ├── storage.js        safe localStorage
│   ├── cosmetics.js      skin catalogue + bot names (data-driven unlock rules)
│   ├── physics.js        mass→radius/speed, movement, wall sliding, moons, PULSE
│   ├── entities.js       Orbling + pellet data types
│   ├── collision.js      spatial hash grid, pickups, absorb, bumps, moon hits, clashes
│   ├── ai.js             BotBrain with 4 personalities
│   ├── world.js          authoritative simulation: spawning, combat, difficulty ramp, events
│   ├── net.js            session interface (LocalSession) + snapshot (de)serialisation
│   ├── effects.js        particles, rings, floating numbers, screen shake, hurt flash
│   ├── audio.js          procedural Web Audio SFX + generative music (no audio files)
│   ├── haptics.js        Vibration API wrapper
│   ├── input.js          floating joystick, follow-finger, mouse, keyboard
│   ├── renderer.js       Canvas 2D renderer (pre-rendered glow sprites, culling)
│   ├── progression.js    profile, XP/levels, achievements, run recording
│   ├── monetization.js   wallet, rewarded-ads / store / battle-pass seams
│   ├── ui.js             screens, HUD, toasts, skins/leaderboard/trophies/settings
│   ├── game.js           main loop, state machine, camera, event → juice glue
│   └── main.js           boot + mobile gesture hardening
├── sw.js                 offline cache (network-first)
├── manifest.webmanifest  PWA: fullscreen, portrait
└── serve.js              tiny static server for LAN testing
```

**Data flow:** `Input` (or `BotBrain`) → `intent {mx, my, ability}` → `World.step(dt)`
→ `world.events` (`pickup`, `eat`, `moonHit`, `clash`, `pulse`, `death`, …) →
`Game.handleEvents` → effects, audio, haptics and UI. The simulation never touches the
DOM, audio or rendering.

### Adding real multiplayer later

`world.js`, `physics.js`, `collision.js`, `ai.js`, `entities.js`, `config.js` and
`utils.js` have no DOM dependencies. They already run in Node (that's how the headless
soak test works). To go online:

1. Run `World` on a Node server and fill empty seats with `BotBrain`s.
2. Clients send intents over a WebSocket. The server writes them to that player's
   `orbling.intent`.
3. The server broadcasts `OB.Net.serializeSnapshot(world)` at ~20 Hz (≈1.3 KB for
   20 orblings) plus the event list.
4. Add a `RemoteSession` alongside `LocalSession` with the same interface (`join`,
   `sendInput`, `update`, `drainEvents`, `world`) that applies snapshots via
   `OB.Net.applySnapshot` and interpolates. `game.js` doesn't need to change.

### Monetization-ready (nothing intrusive ships)

- `OB.Monetization.registerAdsProvider({ isReady(placement), show(placement) })`: the
  "Watch ad: double shards" button on the game-over card shows up automatically once a
  provider says it's ready.
- `OB.Monetization.registerStoreProvider({ purchase(sku) })`: supporter skins, shard
  packs and the season pass are already in the catalogue. `store.fulfil` grants them.
- `OB.Monetization.battlePass`: data-driven tiers keyed off XP (disabled).
- **Rule:** everything sold is cosmetic. Skins don't change stats, so there's no
  pay-to-win.

### Adding content

- **New skin:** append to `SKINS` in `cosmetics.js`. Patterns: `solid`, `ring`, `core`,
  `stripes`, `spiral`, `star`, `rainbow`.
- **New achievement:** append to `ACHIEVEMENTS` in `progression.js` with a
  `test(run, profile)` function.
- **New bot personality:** add an entry to `PERSONALITIES` in `ai.js`.
- **Balance:** everything lives in `config.js`.

## Performance notes

- Glows are pre-rendered sprites drawn with `drawImage` (no `shadowBlur`), and anything
  off-screen is culled.
- The spatial hash grid is a fixed-size array that's reused every step (no garbage
  collection churn).
- Simulation runs in ≤1/60 s sub-steps, so it stays stable on slow frames. A headless
  benchmark measured ~0.16 ms per step with 20 bots and ~950 pellets.
- Device pixel ratio is capped at 2. In **Auto** quality, resolution and particle density
  drop if frames average over 24 ms.
