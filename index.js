require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require('@google/generative-ai');

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

bot.on('message', async (msg) => {
  const chatId = msg.chat.id.toString();
  const text = msg.text;

  // Security: only respond to Matt's chat
  if (ALLOWED_CHAT_ID && chatId !== ALLOWED_CHAT_ID) {
    bot.sendMessage(chatId, '⛔ Unauthorized.');
    return;
  }

  if (!text || text.startsWith('/')) {
    if (text === '/start') {
      bot.sendMessage(chatId, '👋 Hey Matt! Gemini is connected and ready. Send me anything.');
    } else if (text === '/clear') {
      conversations[chatId] = [];
      bot.sendMessage(chatId, '🗑️ Conversation cleared.');
    } else if (text === '/help') {
      bot.sendMessage(chatId,
        '📋 Commands:\n' +
        '/start - Wake up the bot\n' +
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
      model: 'gemini-1.5-flash',
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

console.log('🤖 Gemini Telegram Bot is running...');
