# Project notes for Claude

## Video generation preference

When Matt asks to generate a video, use the Higgsfield MCP tool
(`mcp__Higgs__generate_video`) with the **MiniMax Hailuo** model as the #1
default:

- `model: "minimax_hailuo"`, `variant: "minimax-2.3"` — text-to-video
  (6 credits for 6s @ 768p; works on the free plan)
- `variant: "minimax-2.3-fast"` — only for image-to-video (requires a
  start_image; text-only prompts are rejected)
- Preflight with `get_cost: true` if the balance may be low; select the
  private workspace first if generation reports the wrong workspace.

Only fall back to another model if Hailuo can't do the job (e.g. needs
audio, longer duration, or references), and say so before switching.

## Project

Telegram bot (`index.js`): Gemini chat + `/video` command backed by the
MiniMax Hailuo API (`hailuo.js`, needs `MINIMAX_API_KEY`). Deployed on
Railway (`railway.json`, Nixpacks, `node index.js`).
