require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const hailuo = require('./hailuo');

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

  if (!text || text.startsWith('/')) {
    if (text === '/start') {
      bot.sendMessage(chatId, '👋 Hey Matt! Gemini chat + Hailuo video are connected and ready.');
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
