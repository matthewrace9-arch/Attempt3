// /film pipeline: turn reference photos of the office into a multi-scene
// dog "physical therapy visit" video.
//
// Steps per scene: reference image -> Gemini image edit (remove all humans)
// -> MiniMax Hailuo image-to-video -> stitched with ffmpeg crossfades.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const hailuo = require('./hailuo');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// MiniMax-Hailuo-02 reliably supports first_frame_image (image-to-video)
const I2V_MODEL = process.env.HAILUO_I2V_MODEL || 'MiniMax-Hailuo-02';

const SCENES_DIR = path.join(__dirname, 'data', 'scenes');
const ASSETS_DIR = path.join(__dirname, 'assets');

// Scene plan. `asset` images ship with the repo (frames from Matt's real
// footage); the rest are supplied in Telegram via "/scene <n>" photo captions,
// which override assets too.
const SCENES = [
  {
    n: 1,
    name: 'Arriving',
    asset: 'scene1-entrance.jpg',
    prompt:
      'The cream-colored goldendoodle dog walks confidently in through the open office door ' +
      'into the reception area, tail wagging, as if arriving for an appointment. ' +
      'Natural dog gait, photorealistic fur, keep the room exactly as shown. ' +
      'Smooth subtle handheld camera follows the dog. No people anywhere.',
  },
  {
    n: 2,
    name: 'Checking in',
    asset: null,
    prompt:
      'The large cream goldendoodle stands at the reception counter waiting politely. ' +
      'The small apricot mini doodle behind the desk pops its head up over the counter ' +
      'and looks at the big dog, acting like a receptionist checking in a patient. ' +
      'Subtle natural motion, photorealistic, keep the desk and room exactly as shown. ' +
      'Static camera with a slow gentle push-in. No people anywhere.',
  },
  {
    n: 3,
    name: 'Walking back',
    asset: 'scene3-walk.jpg',
    prompt:
      'The small apricot mini doodle trots ahead leading the way while the large cream ' +
      'goldendoodle follows it across the waiting area toward the open doorway to the ' +
      'therapy room, like a staff member showing a patient where to go. ' +
      'Natural dog movement, photorealistic, keep the room exactly as shown. ' +
      'Smooth tracking camera. No people anywhere.',
  },
  {
    n: 4,
    name: 'Physical therapy',
    asset: null,
    prompt:
      'The large cream goldendoodle carefully does physical therapy exercises in the ' +
      'treatment area while the small apricot mini doodle sits beside it supervising ' +
      'attentively like a physical therapist. Gentle believable motion, photorealistic, ' +
      'keep the room and equipment exactly as shown. Subtle handheld camera. No people anywhere.',
  },
];

const CLEAN_INSTRUCTION =
  'Edit this photo: remove every human being and every human body part (people, hands, ' +
  'arms, legs, reflections, shadows and silhouettes of people) and any objects they are ' +
  'holding. Realistically reconstruct the background behind them. Keep everything else ' +
  'in the room exactly the same: walls, colors, furniture, shelves, plants, decorations, ' +
  'signs, flooring and lighting. Keep any dogs in the photo exactly as they are. ' +
  'Return only the edited photo.';

function sceneImagePath(scene) {
  const userPath = path.join(SCENES_DIR, `scene${scene.n}.jpg`);
  if (fs.existsSync(userPath)) return userPath;
  if (scene.asset) {
    const assetPath = path.join(ASSETS_DIR, scene.asset);
    if (fs.existsSync(assetPath)) return assetPath;
  }
  return null;
}

function saveSceneImage(n, buffer) {
  fs.mkdirSync(SCENES_DIR, { recursive: true });
  const p = path.join(SCENES_DIR, `scene${n}.jpg`);
  fs.writeFileSync(p, buffer);
  return p;
}

// Remove humans from a reference image using Gemini image editing.
// Returns a JPEG buffer; falls back to the original image on failure.
async function removeHumans(imageBuffer) {
  if (!GEMINI_API_KEY) return { buffer: imageBuffer, cleaned: false };
  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: 'image/jpeg', data: imageBuffer.toString('base64') } },
              { text: CLEAN_INSTRUCTION },
            ],
          }],
        }),
      },
    );
    const body = await res.json();
    const parts = body.candidates?.[0]?.content?.parts || [];
    const img = parts.find((p) => p.inlineData?.data || p.inline_data?.data);
    const data = img && (img.inlineData?.data || img.inline_data?.data);
    if (data) return { buffer: Buffer.from(data, 'base64'), cleaned: true };
    console.warn('Gemini clean: no image in response', JSON.stringify(body).slice(0, 300));
  } catch (err) {
    console.warn('Gemini clean failed:', err.message || err);
  }
  return { buffer: imageBuffer, cleaned: false };
}

// Crossfade-concat clips into one video. Falls back to a hard-cut concat if
// the filter graph fails, and to the single clip if there is only one.
function stitchClips(clipPaths, outPath) {
  if (clipPaths.length === 1) {
    fs.copyFileSync(clipPaths[0], outPath);
    return outPath;
  }

  const FADE = 0.5;
  const durations = clipPaths.map((p) =>
    parseFloat(execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', p,
    ]).toString().trim()),
  );

  const inputs = clipPaths.flatMap((p) => ['-i', p]);
  const norm = clipPaths
    .map((_, i) => `[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,` +
      `pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=25,setpts=PTS-STARTPTS[v${i}]`)
    .join(';');

  let graph = norm;
  let prev = 'v0';
  let offset = 0;
  for (let i = 1; i < clipPaths.length; i++) {
    offset += durations[i - 1] - FADE;
    const out = i === clipPaths.length - 1 ? 'vout' : `x${i}`;
    graph += `;[${prev}][v${i}]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(2)}[${out}]`;
    prev = out;
  }

  try {
    execFileSync('ffmpeg', [
      '-y', ...inputs, '-filter_complex', graph, '-map', '[vout]',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '20', outPath,
    ], { stdio: 'pipe' });
  } catch (err) {
    console.warn('xfade stitch failed, falling back to hard cuts:', err.message);
    const listFile = outPath + '.txt';
    fs.writeFileSync(listFile, clipPaths.map((p) => `file '${p}'`).join('\n'));
    execFileSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outPath], { stdio: 'pipe' });
  }
  return outPath;
}

// Run the full pipeline. `onStatus(text)` receives progress lines.
// Returns { videoPath, made, skipped, cleanedCount }.
async function makeFilm(onStatus) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'film-'));
  const clips = [];
  const made = [];
  const skipped = [];
  let cleanedCount = 0;

  for (const scene of SCENES) {
    const imgPath = sceneImagePath(scene);
    if (!imgPath) {
      skipped.push(scene);
      continue;
    }

    await onStatus(`🎬 Scene ${scene.n} (${scene.name}): removing people from the reference…`);
    const { buffer: cleanBuf, cleaned } = await removeHumans(fs.readFileSync(imgPath));
    if (cleaned) cleanedCount++;

    await onStatus(`🎬 Scene ${scene.n} (${scene.name}): generating with Hailuo…`);
    const { buffer: videoBuf } = await hailuo.generateVideo({
      prompt: scene.prompt,
      firstFrameImage: `data:image/jpeg;base64,${cleanBuf.toString('base64')}`,
      model: I2V_MODEL,
      duration: 6,
      resolution: '768P',
      onProgress: (s) => onStatus(`🎬 Scene ${scene.n} (${scene.name}): ${s}…`),
    });

    const clipPath = path.join(workDir, `scene${scene.n}.mp4`);
    fs.writeFileSync(clipPath, videoBuf);
    clips.push(clipPath);
    made.push(scene);
  }

  if (!clips.length) {
    throw new Error('No scene images available. Send photos with "/scene <n>" captions first.');
  }

  await onStatus('🎬 Stitching scenes with crossfades…');
  const videoPath = stitchClips(clips, path.join(workDir, 'film.mp4'));
  return { videoPath, made, skipped, cleanedCount };
}

module.exports = { makeFilm, saveSceneImage, sceneImagePath, SCENES };
