require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const hailuo = require('./hailuo');
const film = require('./film');

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ALLOWED_CHAT_ID = process.env.ALLOWED_CHAT_ID; // 7244947677

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Store conversation history per chat
const conversations = {};

const SYSTEM_PROMPT = `You are a helpful AI assistant connected to Matt's Telegram. Matt is a Sales Rep at DaBella in Boise, ID, pursuing a BBA at University of Idaho. He actively trades using an RSI Mean Reversion Strategy on Liquid (paper trading), runs dropshipping/reselling side ventures, and creates horror/mystery content for TikTok/YouTube.

Keep responses concise and mobile-friendly — this is Telegram, not a desktop chat. Use emojis sparingly. Be direct and actionable.

For trade alerts, use this format:
📊 Ticker | Price | RSI | Direction | Entry | Stop | Target | Confidence | Reason

Always be Matt's execution partner — ready-to-use answers, not lengthy explanations.`;

// Chats with a Hailuo generation currently in flight (one at a time per chat)
const videoJobs = new Set();

// Parse "/video [--6s|--10s] [--512p|--768p|--1080p] <prompt>"
function parseVideoArgs(raw) {
  let duration;
  let resolution;
  const words = [];

  for (const word of raw.trim().split(/\s+/)) {
    const flag = word.toLowerCase();
    if (flag === '--6s' || flag === '--10s') {
      duration = parseInt(flag.slice(2), 10);
    } else if (flag === '--512p' || flag === '--768p' || flag === '--1080p') {
      resolution = flag.slice(2).toUpperCase();
    } else if (word) {
      words.push(word);
    }
  }

  return { prompt: words.join(' '), duration, resolution };
}

// Grab the attached (or replied-to) photo as a data URI for image-to-video
async function getPhotoDataUri(msg) {
  const photos =
    (msg.photo && msg.photo.length && msg.photo) ||
    (msg.reply_to_message && msg.reply_to_message.photo);
  if (!photos || !photos.length) return null;

  // Last entry is the highest-resolution version Telegram keeps
  const link = await bot.getFileLink(photos[photos.length - 1].file_id);
  const res = await fetch(link);
  if (!res.ok) throw new Error(`Failed to download photo from Telegram (HTTP ${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

async function handleVideoCommand(msg, chatId, rawArgs) {
  if (!hailuo.isConfigured()) {
    bot.sendMessage(chatId,
      '⚠️ Hailuo is not configured yet. Set MINIMAX_API_KEY (and optionally MINIMAX_GROUP_ID) ' +
      'in the environment, then restart the bot.'
    );
    return;
  }

  const { prompt, duration, resolution } = parseVideoArgs(rawArgs);
  if (!prompt) {
    bot.sendMessage(chatId,
      '🎬 Usage:\n' +
      '/video <prompt> — text-to-video\n' +
      'Attach or reply to a photo with /video <prompt> — image-to-video\n\n' +
      'Options: --6s, --10s, --512p, --768p, --1080p\n' +
      `Defaults: ${hailuo.DEFAULT_DURATION}s @ ${hailuo.DEFAULT_RESOLUTION} (${hailuo.DEFAULT_MODEL})`
    );
    return;
  }

  if (videoJobs.has(chatId)) {
    bot.sendMessage(chatId, '⏳ A video is already generating for this chat — wait for it to finish.');
    return;
  }
  videoJobs.add(chatId);

  try {
    const firstFrameImage = await getPhotoDataUri(msg);
    const mode = firstFrameImage ? 'image-to-video' : 'text-to-video';
    const status = await bot.sendMessage(chatId, `🎬 Hailuo ${mode} task submitted…`);

    const updateStatus = (line) =>
      bot.editMessageText(line, { chat_id: chatId, message_id: status.message_id }).catch(() => {});

    const { buffer, downloadUrl } = await hailuo.generateVideo({
      prompt,
      firstFrameImage,
      duration,
      resolution,
      onProgress: (s) => updateStatus(`🎬 Hailuo ${mode}: ${s}…`),
    });

    await updateStatus('🎬 Rendering done — uploading to Telegram…');

    // Telegram bot uploads cap at 50MB; fall back to the direct link
    if (buffer.length < 50 * 1024 * 1024) {
      await bot.sendVideo(chatId, buffer, { caption: `🎥 ${prompt}`.slice(0, 1024) },
        { filename: 'hailuo.mp4', contentType: 'video/mp4' });
      await updateStatus('✅ Video delivered.');
    } else {
      await updateStatus(`✅ Video ready (too large to upload): ${downloadUrl}`);
    }
  } catch (err) {
    console.error('Hailuo error:', err.message || err);
    bot.sendMessage(chatId, `⚠️ Hailuo error: ${err.message || err}`);
  } finally {
    videoJobs.delete(chatId);
  }
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id.toString();
  const text = msg.text || msg.caption;

  // Security: only respond to Matt's chat
  if (ALLOWED_CHAT_ID && chatId !== ALLOWED_CHAT_ID) {
    bot.sendMessage(chatId, '⛔ Unauthorized.');
    return;
  }

  // /video works as plain text, as a photo caption, or as a reply to a photo
  if (text && /^\/video(@\w+)?(\s|$)/.test(text)) {
    await handleVideoCommand(msg, chatId, text.replace(/^\/video(@\w+)?/, ''));
    return;
  }

  // /scene <n>: photo caption that stores a reference image for the /film pipeline
  if (text && /^\/scene(@\w+)?(\s|$)/.test(text)) {
    const n = parseInt(text.replace(/^\/scene(@\w+)?/, '').trim(), 10);
    if (!n || n < 1 || n > film.SCENES.length) {
      bot.sendMessage(chatId, `🎞️ Usage: send a photo with the caption "/scene <1-${film.SCENES.length}>".`);
      return;
    }
    try {
      const dataUri = await getPhotoDataUri(msg);
      if (!dataUri) {
        bot.sendMessage(chatId, '🎞️ Attach a photo (or reply to one) with the /scene caption.');
        return;
      }
      film.saveSceneImage(n, Buffer.from(dataUri.split(',')[1], 'base64'));
      const scene = film.SCENES[n - 1];
      bot.sendMessage(chatId, `✅ Saved reference for scene ${n} (${scene.name}). Run /film when ready.`);
    } catch (err) {
      bot.sendMessage(chatId, `⚠️ Could not save scene photo: ${err.message || err}`);
    }
    return;
  }

  // /film: run the multi-scene dog PT video pipeline
  if (text === '/film') {
    if (!hailuo.isConfigured()) {
      bot.sendMessage(chatId, '⚠️ Set MINIMAX_API_KEY first — /film generates its scenes with Hailuo.');
      return;
    }
    if (videoJobs.has(chatId)) {
      bot.sendMessage(chatId, '⏳ A generation is already running for this chat.');
      return;
    }
    videoJobs.add(chatId);
    try {
      const status = await bot.sendMessage(chatId, '🎬 Starting the film pipeline…');
      const onStatus = (line) =>
        bot.editMessageText(line, { chat_id: chatId, message_id: status.message_id }).catch(() => {});

      const { videoPath, made, skipped, cleanedCount } = await film.makeFilm(onStatus);

      await onStatus('🎬 Uploading the finished film…');
      await bot.sendVideo(chatId, videoPath, {
        caption:
          `🎥 Dog PT visit — scenes: ${made.map((s) => s.name).join(', ')}` +
          (skipped.length
            ? `\n(⚠️ skipped ${skipped.map((s) => `${s.n} ${s.name}`).join(', ')} — no reference photo; ` +
              'send one with a "/scene <n>" caption and rerun /film)'
            : '') +
          (cleanedCount < made.length ? '\n(⚠️ some frames could not be auto-cleaned of people)' : ''),
      });
      await onStatus('✅ Film delivered.');
    } catch (err) {
      console.error('Film error:', err.message || err);
      bot.sendMessage(chatId, `⚠️ Film error: ${err.message || err}`);
    } finally {
      videoJobs.delete(chatId);
    }
    return;
  }

  if (!text || text.startsWith('/')) {
    if (text === '/start') {
      bot.sendMessage(chatId, '👋 Hey Matt! Gemini chat + Hailuo video are connected and ready.');
    } else if (text === '/debug') {
      const flag = (v) => (process.env[v] ? '✅ set' : '❌ missing');
      bot.sendMessage(chatId,
        '🔧 Environment check:\n' +
        `TELEGRAM_BOT_TOKEN: ${flag('TELEGRAM_BOT_TOKEN')}\n` +
        `GEMINI_API_KEY: ${flag('GEMINI_API_KEY')}\n` +
        `MINIMAX_API_KEY: ${flag('MINIMAX_API_KEY')}\n` +
        `MINIMAX_GROUP_ID: ${flag('MINIMAX_GROUP_ID')}\n` +
        `ALLOWED_CHAT_ID: ${flag('ALLOWED_CHAT_ID')}\n\n` +
        'Similar names in env: ' +
        (Object.keys(process.env).filter((k) => /mini|max|hailuo/i.test(k)).join(', ') || 'none')
      );
    } else if (text === '/clear') {
      conversations[chatId] = [];
      bot.sendMessage(chatId, '🗑️ Conversation cleared.');
    } else if (text === '/help') {
      bot.sendMessage(chatId,
        '📋 Commands:\n' +
        '/start - Wake up the bot\n' +
        '/video <prompt> - Generate a video with Hailuo (MiniMax)\n' +
        '   • attach/reply to a photo for image-to-video\n' +
        '   • options: --6s --10s --512p --768p --1080p\n' +
        '/scene <n> - (photo caption) save a reference image for /film\n' +
        '/film - Make the multi-scene dog PT visit video\n' +
        '/clear - Clear conversation history\n' +
        '/help - Show this menu\n\n' +
        'Just type anything to chat with Gemini!'
      );
    }
    return;
  }

  // Initialize conversation history
  if (!conversations[chatId]) conversations[chatId] = [];

  // Show typing indicator
  bot.sendChatAction(chatId, 'typing');

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: SYSTEM_PROMPT,
    });

    // Build history (all messages except the latest)
    const history = conversations[chatId].map(m => ({
      role: m.role,
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(text);
    const reply = result.response.text();

    // Save to history
    conversations[chatId].push({ role: 'user', content: text });
    conversations[chatId].push({ role: 'model', content: reply });

    // Keep last 20 messages
    if (conversations[chatId].length > 20) {
      conversations[chatId] = conversations[chatId].slice(-20);
    }

    bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });

  } catch (err) {
    console.error('Gemini API error:', err.message || err);
    bot.sendMessage(chatId, '⚠️ Error reaching Gemini. Try again in a moment.');
  }
});

console.log('🤖 Telegram bot running (Gemini chat + Hailuo/MiniMax video)...');
if (!hailuo.isConfigured()) {
  console.warn('⚠️ MINIMAX_API_KEY not set — /video is disabled until it is configured.');
}
