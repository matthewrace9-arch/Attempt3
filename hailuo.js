// MiniMax Hailuo video generation client.
// Docs: https://platform.minimax.io/docs/guides/video-generation
//
// Flow: create task -> poll status -> retrieve file -> download video buffer.

const API_HOST = process.env.MINIMAX_API_HOST || 'https://api.minimax.io';

const DEFAULT_MODEL = process.env.HAILUO_MODEL || 'MiniMax-Hailuo-2.3';
const DEFAULT_DURATION = parseInt(process.env.HAILUO_DURATION || '6', 10);
const DEFAULT_RESOLUTION = process.env.HAILUO_RESOLUTION || '768P';

const POLL_INTERVAL_MS = 10_000;
const POLL_TIMEOUT_MS = 15 * 60_000;

function apiKey() {
  return process.env.MINIMAX_API_KEY;
}

function isConfigured() {
  return Boolean(apiKey());
}

async function minimaxFetch(path, options = {}) {
  const res = await fetch(`${API_HOST}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error(`MiniMax API returned non-JSON response (HTTP ${res.status})`);
  }

  const baseResp = body.base_resp;
  if (baseResp && baseResp.status_code !== 0) {
    throw new Error(`MiniMax API error ${baseResp.status_code}: ${baseResp.status_msg}`);
  }
  if (!res.ok) {
    throw new Error(`MiniMax API HTTP ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

// Create a video generation task. `firstFrameImage` (optional) is a data URI or
// public URL used as the first frame for image-to-video.
async function createVideoTask({ prompt, firstFrameImage, model, duration, resolution }) {
  const payload = {
    model: model || DEFAULT_MODEL,
    prompt,
    duration: duration || DEFAULT_DURATION,
    resolution: resolution || DEFAULT_RESOLUTION,
  };
  if (firstFrameImage) payload.first_frame_image = firstFrameImage;

  const body = await minimaxFetch('/v1/video_generation', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!body.task_id) {
    throw new Error(`MiniMax did not return a task_id: ${JSON.stringify(body)}`);
  }
  return body.task_id;
}

async function queryVideoTask(taskId) {
  return minimaxFetch(`/v1/query/video_generation?task_id=${encodeURIComponent(taskId)}`, {
    method: 'GET',
  });
}

// Resolve a completed task's file_id into a downloadable URL.
async function retrieveFileUrl(fileId) {
  const groupId = process.env.MINIMAX_GROUP_ID;
  const params = new URLSearchParams({ file_id: fileId });
  if (groupId) params.set('GroupId', groupId);

  const body = await minimaxFetch(`/v1/files/retrieve?${params.toString()}`, { method: 'GET' });
  const url = body.file && body.file.download_url;
  if (!url) {
    throw new Error(`MiniMax file retrieve returned no download_url: ${JSON.stringify(body)}`);
  }
  return url;
}

// Poll a task until it finishes. `onProgress(status)` fires whenever the
// reported status changes (Queueing, Preparing, Processing, ...).
async function waitForVideoTask(taskId, onProgress) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let lastStatus = '';

  while (Date.now() < deadline) {
    const body = await queryVideoTask(taskId);
    const status = body.status || '';

    if (status !== lastStatus) {
      lastStatus = status;
      if (onProgress) await onProgress(status);
    }

    if (status === 'Success') {
      if (!body.file_id) {
        throw new Error(`Task succeeded but returned no file_id: ${JSON.stringify(body)}`);
      }
      return body.file_id;
    }
    if (status === 'Fail') {
      const msg = (body.base_resp && body.base_resp.status_msg) || 'unknown error';
      throw new Error(`Video generation failed: ${msg}`);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error('Timed out waiting for video generation (15 min).');
}

async function downloadVideo(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download generated video (HTTP ${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

// End-to-end: create the task, wait for it, and return the video as a Buffer
// plus its download URL (as a fallback for oversized uploads).
async function generateVideo({ prompt, firstFrameImage, model, duration, resolution, onProgress }) {
  const taskId = await createVideoTask({ prompt, firstFrameImage, model, duration, resolution });
  const fileId = await waitForVideoTask(taskId, onProgress);
  const downloadUrl = await retrieveFileUrl(fileId);
  const buffer = await downloadVideo(downloadUrl);
  return { buffer, downloadUrl, taskId, fileId };
}

module.exports = {
  isConfigured,
  generateVideo,
  DEFAULT_MODEL,
  DEFAULT_DURATION,
  DEFAULT_RESOLUTION,
};
