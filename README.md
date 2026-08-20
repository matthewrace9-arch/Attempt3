# Matt's Telegram Bot — Gemini chat + Hailuo (MiniMax) video

A Telegram bot that chats via Google Gemini and generates videos via
**MiniMax Hailuo** (`/video`). Deployed on Railway.

## Commands

| Command | What it does |
|---|---|
| `/video <prompt>` | Text-to-video with Hailuo |
| photo + caption `/video <prompt>` | Image-to-video (photo becomes the first frame) |
| reply to a photo with `/video <prompt>` | Same as above |
| `/clear` | Clear Gemini conversation history |
| `/help` | Show the command menu |
| anything else | Chat with Gemini |

`/video` options (mix freely, order doesn't matter):

```
/video --10s --1080p a slow dolly shot through a foggy abandoned asylum, horror film lighting
```

- Duration: `--6s` (default) or `--10s`
- Resolution: `--512p`, `--768p` (default), `--1080p`

The bot posts a live status message (Queueing → Preparing → Processing) and
uploads the finished MP4 to the chat. Renders typically take 1–5 minutes; one
generation runs per chat at a time.

## /film — multi-scene dog PT visit video

`/film` builds the "dogs at Boise Foothills Physical Therapy" video from real
reference photos of the office:

1. Scenes 1 and 3 ship with the repo (`assets/`, frames from the real footage).
2. Send the front-desk photo with the caption `/scene 2`, and a photo of the
   PT/exercise area with the caption `/scene 4`. (A `/scene <n>` photo also
   overrides a bundled frame.)
3. Send `/film`. For each scene the bot removes humans from the reference
   frame (Gemini image editing via `GEMINI_API_KEY`), animates it with Hailuo
   image-to-video (6s @ 768P), stitches the clips with crossfades (ffmpeg via
   `nixpacks.toml`), and sends back the finished MP4.

Scenes without a reference image are skipped with a note. Uses
`HAILUO_I2V_MODEL` (default `MiniMax-Hailuo-02`) since image-to-video requires
first-frame support.

## Hailuo (MiniMax) setup

1. Create an account at [platform.minimax.io](https://platform.minimax.io) and add credit
   (video generation is pay-per-use).
2. Create an API key under **Account → API Keys**.
3. Copy your **GroupID** from the account page (some accounts need it for file retrieval).
4. Set the environment variables (Railway → your service → **Variables**):
   - `MINIMAX_API_KEY` — required
   - `MINIMAX_GROUP_ID` — optional
5. Redeploy. `/video` announces itself as unconfigured until the key is present.

Optional overrides:

| Variable | Default | Notes |
|---|---|---|
| `HAILUO_MODEL` | `MiniMax-Hailuo-2.3` | e.g. `MiniMax-Hailuo-2.3-Fast`, `MiniMax-Hailuo-02` |
| `HAILUO_DURATION` | `6` | seconds; `6` or `10` |
| `HAILUO_RESOLUTION` | `768P` | `512P`, `768P`, or `1080P` |
| `MINIMAX_API_HOST` | `https://api.minimax.io` | use `https://api.minimaxi.com` for Mainland China accounts |

Not every model supports every duration/resolution combo (e.g. `1080P` is
6s-only on some models) — the bot surfaces the API's error message if a combo
is rejected.

## Full environment

See `.env.example`. Required: `TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`,
`MINIMAX_API_KEY`. Recommended: `ALLOWED_CHAT_ID` (locks the bot to one chat).

## Run locally

```
npm install
cp .env.example .env   # fill in your keys
node index.js
```

Requires Node 18+ (uses the built-in `fetch`).
