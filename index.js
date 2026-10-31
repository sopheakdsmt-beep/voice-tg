require('dotenv').config();

// Patch SandwichStream for Node.js 20+ / 26+ streams compatibility
// Fixes Telegraf stream stalls on modern Node.js when uploading voice, audio, or documents
try {
  const sandwichStreamPkg = require('sandwich-stream');
  const SandwichStream = sandwichStreamPkg.SandwichStream || sandwichStreamPkg.default || sandwichStreamPkg;
  if (SandwichStream && SandwichStream.prototype) {
    SandwichStream.prototype.currentStreamOnReadable = function () {
      if (!this.currentStream) return;
      let chunk;
      while ((chunk = this.currentStream.read()) !== null) {
        this.push(chunk);
      }
    };
  }
} catch (err) {
  console.warn('SandwichStream compatibility patch warning:', err);
}

const fs = require('fs');
const path = require('path');
const { Telegraf, Markup } = require('telegraf');
const config = require('./config');
const storage = require('./storage');
const { synthesizeSpeech, resolveVoice } = require('./tts');
const { transcribeAudio } = require('./stt');

// Verify Environment Variables
if (!config.BOT_TOKEN) {
  console.error('ERROR: BOT_TOKEN is missing in .env file!');
  process.exit(1);
}
if (!config.GROQ_API_KEY) {
  console.error('ERROR: GROQ_API_KEY is missing in .env file!');
  process.exit(1);
}

const bot = new Telegraf(config.BOT_TOKEN);

// Ensure temp directory exists
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Escape HTML special characters to prevent Telegram formatting errors
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ==========================================
// Helper UI & Keyboard Builders
// ==========================================

/**
 * Format status message for user settings
 */
function buildSettingsSummary(userId) {
  const s = storage.getUserSettings(userId);
  const voiceObj = config.VOICES[s.voice];
  const voiceName = s.voice === 'auto' ? '🤖 Auto-Detect (ស្វ័យប្រវត្តិ)' : `${voiceObj?.flag} ${voiceObj?.name}`;
  const speedObj = config.SPEEDS[s.speed] || config.SPEEDS['1.0'];
  const modeObj = config.AUDIO_MODES[s.audioMode] || config.AUDIO_MODES.voice;
  const sttObj = config.STT_FORMATS[s.sttFormat] || config.STT_FORMATS.both;

  return (
    `⚙️ <b>ការកំណត់បច្ចុប្បន្នរបស់អ្នក (Current Settings):</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🎙️ <b>សំឡេង (Voice):</b> ${escapeHtml(voiceName)}\n` +
    `⚡ <b>ល្បឿន (Speed):</b> ${escapeHtml(speedObj.label)} (${escapeHtml(speedObj.description)})\n` +
    `🔊 <b>ទម្រង់សំឡេង (Audio Mode):</b> ${escapeHtml(modeObj.icon)} ${escapeHtml(modeObj.name)}\n` +
    `📝 <b>ទម្រង់ STT (STT Format):</b> ${escapeHtml(sttObj.icon)} ${escapeHtml(sttObj.name)}`
  );
}

/**
 * Build Voice Selection Keyboard
 */
function buildVoiceKeyboard(userId) {
  const s = storage.getUserSettings(userId);
  const currentVoice = s.voice;

  const buttons = [];

  // Auto detect button
  const autoActive = currentVoice === 'auto' ? '✅ ' : '';
  buttons.push([Markup.button.callback(`${autoActive}🤖 Auto-Detect (ខ្មែរ/English)`, 'set_voice:auto')]);

  // Voice buttons
  const voiceButtons = Object.values(config.VOICES).map((v) => {
    const active = currentVoice === v.id ? '✅ ' : '';
    return Markup.button.callback(`${active}${v.flag} ${v.name} (${v.gender})`, `set_voice:${v.id}`);
  });

  // 2 per row
  for (let i = 0; i < voiceButtons.length; i += 2) {
    buttons.push(voiceButtons.slice(i, i + 2));
  }

  // Action buttons
  buttons.push([
    Markup.button.callback('⚡ កែសម្រួលល្បឿន', 'menu:speed'),
    Markup.button.callback('🔊 ទម្រង់ Audio', 'menu:mode')
  ]);
  buttons.push([Markup.button.callback('🏠 មឺនុយមេ (Main Menu)', 'menu:main')]);

  return Markup.inlineKeyboard(buttons);
}

/**
 * Build Speed Selection Keyboard
 */
function buildSpeedKeyboard(userId) {
  const s = storage.getUserSettings(userId);
  const currentSpeed = s.speed;

  const buttons = Object.values(config.SPEEDS).map((sp) => {
    const active = currentSpeed === sp.value ? '✅ ' : '';
    return Markup.button.callback(`${active}${sp.label}`, `set_speed:${sp.value}`);
  });

  return Markup.inlineKeyboard([
    buttons,
    [Markup.button.callback('🎙️ ជ្រើសរើសសំឡេង', 'menu:voice'), Markup.button.callback('🔊 ទម្រង់ Audio', 'menu:mode')],
    [Markup.button.callback('🏠 មឺនុយមេ (Main Menu)', 'menu:main')]
  ]);
}

/**
 * Build Audio Mode Keyboard
 */
function buildAudioModeKeyboard(userId) {
  const s = storage.getUserSettings(userId);
  const currentMode = s.audioMode;

  const buttons = Object.values(config.AUDIO_MODES).map((m) => {
    const active = currentMode === m.id ? '✅ ' : '';
    return [Markup.button.callback(`${active}${m.icon} ${m.name}`, `set_mode:${m.id}`)];
  });

  buttons.push([
    Markup.button.callback('🎙️ សំឡេង (Voice)', 'menu:voice'),
    Markup.button.callback('⚡ ល្បឿន (Speed)', 'menu:speed')
  ]);
  buttons.push([Markup.button.callback('🏠 មឺនុយមេ (Main Menu)', 'menu:main')]);

  return Markup.inlineKeyboard(buttons);
}

/**
 * Build STT Format Keyboard
 */
function buildSttKeyboard(userId) {
  const s = storage.getUserSettings(userId);
  const currentStt = s.sttFormat;

  const buttons = Object.values(config.STT_FORMATS).map((f) => {
    const active = currentStt === f.id ? '✅ ' : '';
    return [Markup.button.callback(`${active}${f.icon} ${f.name}`, `set_stt:${f.id}`)];
  });

  buttons.push([Markup.button.callback('🏠 មឺនុយមេ (Main Menu)', 'menu:main')]);

  return Markup.inlineKeyboard(buttons);
}

/**
 * Build Quick Voice Switch Buttons for TTS Output
 */
function buildQuickSwitchKeyboard(snippetId, currentVoiceId) {
  const buttons = [];

  // Offer alternative voices
  const alternatives = Object.values(config.VOICES).filter((v) => v.id !== currentVoiceId);

  // Group into pairs
  const switchBtns = alternatives.map((v) =>
    Markup.button.callback(`🔄 ${v.flag} ${v.shortName}`, `tts:switch:${snippetId}:${v.id}`)
  );

  for (let i = 0; i < switchBtns.length; i += 2) {
    buttons.push(switchBtns.slice(i, i + 2));
  }

  // Settings shortcut
  buttons.push([
    Markup.button.callback('⚡ ល្បឿន', 'menu:speed'),
    Markup.button.callback('⚙️ ការកំណត់', 'menu:voice')
  ]);

  return Markup.inlineKeyboard(buttons);
}

/**
 * Build Action Buttons for STT Output
 */
function buildSttResultKeyboard(snippetId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📄 Download .SRT Subtitles', `stt:download_srt:${snippetId}`),
      Markup.button.callback('🔊 Speak Back (TTS)', `stt:speak:${snippetId}`)
    ],
    [Markup.button.callback('⚙️ កំណត់ STT Format', 'menu:stt')]
  ]);
}

// ==========================================
// Bot Commands
// ==========================================

// /start command
bot.command('start', async (ctx) => {
  const userId = ctx.from.id;
  const firstName = ctx.from.first_name || 'មិត្ត';

  const welcomeText =
    `👋 <b>សួស្តី ${escapeHtml(firstName)}! សូមស្វាគមន៍មកកាន់ VoiceKhTTS Bot</b>\n\n` +
    `🤖 <b>មុខងារសំខាន់ៗទាំង ២ របស់ Bot:</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `1️⃣ <b>Text-To-Speech (TTS):</b>\n` +
    `   ✍️ ផ្ញើអត្ថបទជាអក្សរធម្មតាមក Bot នឹងបំប្លែងទៅជាសំឡេងភ្លាមៗ!\n` +
    `   🇰🇭 សំឡេងខ្មែរ: <b>ពិសិដ្ឋ</b> (Piseth) និង <b>ស្រីមុំ</b> (Sreymom)\n` +
    `   🇺🇸 សំឡេងអង់គ្លេស: <b>Jenny</b> និង <b>Guy</b>\n` +
    `   ✨ មាន Auto-Detect ភាសាខ្មែរ និងអង់គ្លេសស្វ័យប្រវត្តិ!\n\n` +
    `2️⃣ <b>Speech-To-Text (STT - Groq Whisper):</b>\n` +
    `   🎙️ ផ្ញើសារសំឡេង (Voice Note) ឬឯកសារចម្រៀង (.mp3, .ogg, .wav, .m4a)\n` +
    `   📝 Bot នឹងទាញយក និងបំប្លែងទៅជាអត្ថបទព្រមទាំងបង្កើត Subtitle .SRT!\n\n` +
    `${buildSettingsSummary(userId)}\n\n` +
    `👇 <b>សូមចុចប៊ូតុងខាងក្រោមដើម្បីកែសម្រួលការកំណត់:</b>`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🎙️ ជ្រើសរើសសំឡេង', 'menu:voice'), Markup.button.callback('⚡ ល្បឿននិយាយ', 'menu:speed')],
    [Markup.button.callback('🔊 ទម្រង់ Audio', 'menu:mode'), Markup.button.callback('📝 ទម្រង់ STT', 'menu:stt')],
    [Markup.button.callback('❓ មើលជំនួយ (Help)', 'menu:help')]
  ]);

  await ctx.replyWithHTML(welcomeText, keyboard);
});

// /help command
bot.command('help', async (ctx) => {
  const helpText =
    `📖 <b>ការណែនាំអំពីការប្រើប្រាស់ Bot:</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🗣️ <b>១. បំប្លែងអក្សរទៅជាសំឡេង (TTS):</b>\n` +
    `• គ្រាន់តែវាយអត្ថបទជាភាសាខ្មែរ ឬអង់គ្លេស រួចផ្ញើមកកាន់ Bot\n` +
    `• Bot នឹងអានអត្ថបទនោះតាមសំឡេង និងល្បឿនដែលអ្នកបានកំណត់\n` +
    `• ក្រោយពេលទទួលបានសំឡេង អ្នកអាចចុចប៊ូតុង "🔄 ស្ដាប់ជា..." ដើម្បីប្ដូរសំឡេងភ្លាមៗដោយមិនបាច់វាយអក្សរម្ដងទៀត\n\n` +
    `🎙️ <b>២. បំប្លែងសំឡេងទៅជាអក្សរ (STT):</b>\n` +
    `• ផ្ញើសារសំឡេង (Voice) ឬឯកសារ Audio (.mp3, .ogg, .m4a, .wav)\n` +
    `• Bot ដំណើរការដោយ Groq Whisper ម៉ូឌែល whisper-large-v3 លឿន និងសុក្រឹតបំផុត\n` +
    `• អាចទាញយកឯកសារ Subtitle (.srt) ឬឱ្យ Bot អានអត្ថបទនោះឡើងវិញភ្លាមៗ\n\n` +
    `⌨️ <b>ពាក្យបញ្ជាផ្លូវកាត់ (Shortcuts):</b>\n` +
    `• /start - ចាប់ផ្ដើម និងមើលមឺនុយមេ\n` +
    `• /voice - ជ្រើសរើសសំឡេង\n` +
    `• /speed - កែសម្រួលល្បឿន (0.75x, 1.0x, 1.25x, 1.5x)\n` +
    `• /mode - ប្ដូររវាង Voice Note និង MP3 File\n` +
    `• /stt - កំណត់ទម្រង់លទ្ធផល STT (Both, Text, SRT)\n` +
    `• /piseth - ប្ដូរទៅសំឡេង ពិសិដ្ឋ (ប្រុស 🇰🇭)\n` +
    `• /sreymom - ប្ដូរទៅសំឡេង ស្រីមុំ (ស្រី 🇰🇭)\n` +
    `• /jenny - ប្ដូរទៅសំឡេង Jenny (ស្រី 🇺🇸)\n` +
    `• /guy - ប្ដូរទៅសំឡេង Guy (ប្រុស 🇺🇸)\n` +
    `• /help - បង្ហាញជំនួយនេះ`;

  await ctx.replyWithHTML(helpText);
});

// /voice command
bot.command('voice', async (ctx) => {
  const userId = ctx.from.id;
  await ctx.replyWithHTML(
    `🎙️ <b>សូមជ្រើសរើសសំឡេង (Choose Voice):</b>\n\n` +
      `• <b>Auto-Detect:</b> ស្វ័យប្រវត្តិតាមអត្ថបទ (ខ្មែរ 👉 ពិសិដ្ឋ, អង់គ្លេស 👉 Jenny)\n` +
      `• <b>ពិសិដ្ឋ (Piseth):</b> សំឡេងប្រុសខ្មែរ 🇰🇭\n` +
      `• <b>ស្រីមុំ (Sreymom):</b> សំឡេងស្រីខ្មែរ 🇰🇭\n` +
      `• <b>Jenny:</b> សំឡេងស្រីអង់គ្លេស 🇺🇸\n` +
      `• <b>Guy:</b> សំឡេងប្រុសអង់គ្លេស 🇺🇸`,
    buildVoiceKeyboard(userId)
  );
});

// /speed command
bot.command('speed', async (ctx) => {
  const userId = ctx.from.id;
  await ctx.replyWithHTML(
    `⚡ <b>សូមជ្រើសរើសល្បឿននិយាយ (Choose Speed):</b>\n\n` +
      `• <b>0.75x:</b> យឺត (Slow)\n` +
      `• <b>1.0x:</b> ធម្មតា (Normal - លំនាំដើម)\n` +
      `• <b>1.25x:</b> លឿនបន្តិច (Fast)\n` +
      `• <b>1.5x:</b> លឿនខ្លាំង (Faster)`,
    buildSpeedKeyboard(userId)
  );
});

// /mode command
bot.command('mode', async (ctx) => {
  const userId = ctx.from.id;
  await ctx.replyWithHTML(
    `🔊 <b>ជ្រើសរើសទម្រង់បញ្ជូនសំឡេង (Audio Format):</b>\n\n` +
      `• 🎙️ <b>Voice Note:</b> បង្ហាញជារលកសំឡេង ចុចស្ដាប់ភ្លាមៗក្នុង Telegram\n` +
      `• 🎵 <b>MP3 File:</b> ឯកសារចម្រៀង MP3 ងាយស្រួលទាញយក ឬរក្សាទុក`,
    buildAudioModeKeyboard(userId)
  );
});

// /stt command
bot.command('stt', async (ctx) => {
  const userId = ctx.from.id;
  await ctx.replyWithHTML(
    `📝 <b>ជ្រើសរើសទម្រង់លទ្ធផល STT (Transcription):</b>\n\n` +
      `1️⃣ <b>Both:</b> ផ្ញើទាំងអត្ថបទ Text និងឯកសារ .SRT Subtitle\n` +
      `2️⃣ <b>Text Only:</b> ផ្ញើតែអត្ថបទដែលបានបកប្រែ\n` +
      `3️⃣ <b>SRT Only:</b> ផ្ញើតែឯកសារ .SRT Subtitle`,
    buildSttKeyboard(userId)
  );
});

// Voice shortcuts: /piseth, /sreymom, /jenny, /guy
bot.command('piseth', async (ctx) => {
  storage.setVoice(ctx.from.id, 'km-KH-PisethNeural');
  await ctx.replyWithHTML('✅ បានកំណត់សំឡេងទៅជា: <b>🇰🇭 ពិសិដ្ឋ (Piseth - Male)</b> រួចរាល់!');
});

bot.command('sreymom', async (ctx) => {
  storage.setVoice(ctx.from.id, 'km-KH-SreymomNeural');
  await ctx.replyWithHTML('✅ បានកំណត់សំឡេងទៅជា: <b>🇰🇭 ស្រីមុំ (Sreymom - Female)</b> រួចរាល់!');
});

bot.command('jenny', async (ctx) => {
  storage.setVoice(ctx.from.id, 'en-US-JennyNeural');
  await ctx.replyWithHTML('✅ បានកំណត់សំឡេងទៅជា: <b>🇺🇸 Jenny (Female)</b> រួចរាល់!');
});

bot.command('guy', async (ctx) => {
  storage.setVoice(ctx.from.id, 'en-US-GuyNeural');
  await ctx.replyWithHTML('✅ បានកំណត់សំឡេងទៅជា: <b>🇺🇸 Guy (Male)</b> រួចរាល់!');
});

// ==========================================
// Inline Keyboard Callback Handlers
// ==========================================

// Menu navigation
bot.action('menu:main', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  await ctx.editMessageText(
    `🏠 <b>មឺនុយមេ (Main Menu):</b>\n\n${buildSettingsSummary(userId)}\n\n👇 សូមជ្រើសរើសការកំណត់:`,
    {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🎙️ ជ្រើសរើសសំឡេង', 'menu:voice'), Markup.button.callback('⚡ ល្បឿននិយាយ', 'menu:speed')],
        [Markup.button.callback('🔊 ទម្រង់ Audio', 'menu:mode'), Markup.button.callback('📝 ទម្រង់ STT', 'menu:stt')],
        [Markup.button.callback('❓ មើលជំនួយ (Help)', 'menu:help')]
      ]).reply_markup
    }
  );
});

bot.action('menu:voice', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  await ctx.editMessageText(`🎙️ <b>សូមជ្រើសរើសសំឡេង (Choose Voice):</b>`, {
    parse_mode: 'HTML',
    reply_markup: buildVoiceKeyboard(userId).reply_markup
  });
});

bot.action('menu:speed', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  await ctx.editMessageText(`⚡ <b>សូមជ្រើសរើសល្បឿននិយាយ (Choose Speed):</b>`, {
    parse_mode: 'HTML',
    reply_markup: buildSpeedKeyboard(userId).reply_markup
  });
});

bot.action('menu:mode', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  await ctx.editMessageText(`🔊 <b>ជ្រើសរើសទម្រង់បញ្ជូនសំឡេង (Audio Format):</b>`, {
    parse_mode: 'HTML',
    reply_markup: buildAudioModeKeyboard(userId).reply_markup
  });
});

bot.action('menu:stt', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  await ctx.editMessageText(`📝 <b>ជ្រើសរើសទម្រង់លទ្ធផល STT (Transcription):</b>`, {
    parse_mode: 'HTML',
    reply_markup: buildSttKeyboard(userId).reply_markup
  });
});

bot.action('menu:help', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `📖 <b>របៀបប្រើប្រាស់:</b>\n` +
      `• វាយអក្សរផ្ញើមក 👉 Bot នឹងបំប្លែងទៅជាសំឡេង (TTS)\n` +
      `• ផ្ញើសំឡេង Voice ឬ Audio មក 👉 Bot នឹងបំប្លែងទៅជាអក្សរ (STT)\n\n` +
      `ចុចប៊ូតុងខាងក្រោមដើម្បីត្រឡប់ទៅមឺនុយមេ:`,
    {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🏠 មឺនុយមេ', 'menu:main')]]).reply_markup
    }
  );
});

// Setting handlers
bot.action(/set_voice:(.+)/, async (ctx) => {
  const voiceId = ctx.match[1];
  const userId = ctx.from.id;
  storage.setVoice(userId, voiceId);

  const voiceLabel =
    voiceId === 'auto'
      ? 'Auto-Detect (ស្វ័យប្រវត្តិ)'
      : config.VOICES[voiceId]?.name || voiceId;

  await ctx.answerCbQuery(`✅ បានជ្រើសរើស: ${voiceLabel}`);
  await ctx.editMessageReplyMarkup(buildVoiceKeyboard(userId).reply_markup);
});

bot.action(/set_speed:(.+)/, async (ctx) => {
  const speed = ctx.match[1];
  const userId = ctx.from.id;
  storage.setSpeed(userId, speed);

  const spObj = config.SPEEDS[speed];
  await ctx.answerCbQuery(`✅ បានកំណត់ល្បឿន: ${spObj?.label || speed}`);
  await ctx.editMessageReplyMarkup(buildSpeedKeyboard(userId).reply_markup);
});

bot.action(/set_mode:(.+)/, async (ctx) => {
  const mode = ctx.match[1];
  const userId = ctx.from.id;
  storage.setAudioMode(userId, mode);

  const modeObj = config.AUDIO_MODES[mode];
  await ctx.answerCbQuery(`✅ បានជ្រើសរើស: ${modeObj?.name || mode}`);
  await ctx.editMessageReplyMarkup(buildAudioModeKeyboard(userId).reply_markup);
});

bot.action(/set_stt:(.+)/, async (ctx) => {
  const format = ctx.match[1];
  const userId = ctx.from.id;
  storage.setSttFormat(userId, format);

  const sttObj = config.STT_FORMATS[format];
  await ctx.answerCbQuery(`✅ បានជ្រើសរើស STT: ${sttObj?.name || format}`);
  await ctx.editMessageReplyMarkup(buildSttKeyboard(userId).reply_markup);
});

// Quick voice switch after TTS generated: tts:switch:<snippetId>:<voiceId>
bot.action(/tts:switch:([^:]+):([^:]+)/, async (ctx) => {
  const snippetId = ctx.match[1];
  const targetVoiceId = ctx.match[2];
  const userId = ctx.from.id;

  const snippet = storage.getSnippet(snippetId);
  if (!snippet || !snippet.text) {
    return ctx.answerCbQuery('⚠️ អត្ថបទផុតកំណត់ សូមផ្ញើអត្ថបទម្ដងទៀត!', { show_alert: true });
  }

  const voiceObj = config.VOICES[targetVoiceId];
  await ctx.answerCbQuery(`🔄 កំពុងបំប្លែងជាសំឡេង ${voiceObj?.name || targetVoiceId}...`);

  const userSettings = storage.getUserSettings(userId);

  try {
    const { filePath, cleanup } = await synthesizeSpeech({
      text: snippet.text,
      voice: targetVoiceId,
      speed: userSettings.speed
    });

    const caption =
      `🗣️ <b>សំឡេង:</b> ${voiceObj?.flag} ${escapeHtml(voiceObj?.name)}\n` +
      `⚡ <b>ល្បឿន:</b> ${escapeHtml(userSettings.speed)}x\n` +
      `📝 <b>អត្ថបទ:</b> "${escapeHtml(snippet.text.length > 80 ? snippet.text.substring(0, 77) + '...' : snippet.text)}"`;

    const keyboard = buildQuickSwitchKeyboard(snippetId, targetVoiceId);

    if (userSettings.audioMode === 'audio') {
      await ctx.replyWithAudio(
        { source: filePath, filename: `${voiceObj?.shortName || 'audio'}.mp3` },
        {
          caption,
          parse_mode: 'HTML',
          title: `Voice TTS (${voiceObj?.name})`,
          performer: voiceObj?.name,
          reply_markup: keyboard.reply_markup
        }
      );
    } else {
      await ctx.replyWithVoice(
        { source: filePath },
        {
          caption,
          parse_mode: 'HTML',
          reply_markup: keyboard.reply_markup
        }
      );
    }

    cleanup();
  } catch (err) {
    console.error('Error switching voice:', err);
    await ctx.reply(`❌ បរាជ័យក្នុងការប្ដូរសំឡេង: ${err.message}`);
  }
});

// STT Download .SRT callback
bot.action(/stt:download_srt:(.+)/, async (ctx) => {
  const snippetId = ctx.match[1];
  const snippet = storage.getSnippet(snippetId);

  if (!snippet || !snippet.meta || !snippet.meta.srtContent) {
    return ctx.answerCbQuery('⚠️ ឯកសារ SRT ផុតកំណត់ សូមផ្ញើសំឡេងម្ដងទៀត!', { show_alert: true });
  }

  await ctx.answerCbQuery('📄 កំពុងផ្ញើឯកសារ .SRT...');

  // Create temporary SRT file to send
  const tempSrtPath = path.join(TEMP_DIR, `subtitles_${Date.now()}.srt`);
  try {
    await fs.promises.writeFile(tempSrtPath, snippet.meta.srtContent, 'utf8');
    await ctx.replyWithDocument(
      { source: tempSrtPath, filename: 'transcript_subtitles.srt' },
      { caption: '📄 <b>ឯកសារ Subtitle (.srt)</b> សម្រាប់វីដេអូ ឬកម្មវិធីចាក់មេឌៀ', parse_mode: 'HTML' }
    );
  } catch (err) {
    console.error('Error sending SRT:', err);
    await ctx.reply(`❌ មិនអាចទាញយក SRT បានទេ: ${err.message}`);
  } finally {
    try {
      if (fs.existsSync(tempSrtPath)) fs.unlinkSync(tempSrtPath);
    } catch (_) {}
  }
});

// STT Speak Back callback
bot.action(/stt:speak:(.+)/, async (ctx) => {
  const snippetId = ctx.match[1];
  const snippet = storage.getSnippet(snippetId);
  const userId = ctx.from.id;

  if (!snippet || !snippet.text) {
    return ctx.answerCbQuery('⚠️ អត្ថបទផុតកំណត់ សូមផ្ញើសំឡេងម្ដងទៀត!', { show_alert: true });
  }

  await ctx.answerCbQuery('🔊 កំពុងអានអត្ថបទនេះ...');

  const userSettings = storage.getUserSettings(userId);

  try {
    const { filePath, voiceUsed, cleanup } = await synthesizeSpeech({
      text: snippet.text,
      voice: userSettings.voice,
      speed: userSettings.speed
    });

    const voiceObj = config.VOICES[voiceUsed];
    const caption =
      `🔊 <b>អានត្រឡប់មកវិញ (Speak Back):</b>\n` +
      `🗣️ <b>សំឡេង:</b> ${voiceObj?.flag} ${escapeHtml(voiceObj?.name)}\n` +
      `⚡ <b>ល្បឿន:</b> ${escapeHtml(userSettings.speed)}x`;

    const keyboard = buildQuickSwitchKeyboard(snippetId, voiceUsed);

    if (userSettings.audioMode === 'audio') {
      await ctx.replyWithAudio(
        { source: filePath, filename: 'speak_back.mp3' },
        {
          caption,
          parse_mode: 'HTML',
          title: 'Transcribed Speech',
          performer: voiceObj?.name,
          reply_markup: keyboard.reply_markup
        }
      );
    } else {
      await ctx.replyWithVoice(
        { source: filePath },
        {
          caption,
          parse_mode: 'HTML',
          reply_markup: keyboard.reply_markup
        }
      );
    }

    cleanup();
  } catch (err) {
    console.error('Error speaking back STT text:', err);
    await ctx.reply(`❌ មិនអាចអានអត្ថបទបានទេ: ${err.message}`);
  }
});

// ==========================================
// Message Handlers
// ==========================================

// Handle Text Messages (TTS)
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();

  // If text starts with '/', let Telegraf command handlers or ignore
  if (text.startsWith('/')) {
    return;
  }

  const userId = ctx.from.id;
  const userSettings = storage.getUserSettings(userId);

  // Send action status in chat
  await ctx.sendChatAction(userSettings.audioMode === 'audio' ? 'upload_document' : 'record_voice');

  try {
    const { filePath, voiceUsed, cleanup } = await synthesizeSpeech({
      text,
      voice: userSettings.voice,
      speed: userSettings.speed
    });

    const voiceObj = config.VOICES[voiceUsed];
    const snippetId = storage.saveSnippet(text, { voiceUsed, speed: userSettings.speed });

    // Truncate preview text in caption if too long
    const previewText = text.length > 70 ? text.substring(0, 67) + '...' : text;
    const caption =
      `🗣️ <b>សំឡេង:</b> ${voiceObj?.flag} ${escapeHtml(voiceObj?.name)}\n` +
      `⚡ <b>ល្បឿន:</b> ${escapeHtml(userSettings.speed)}x\n` +
      `📝 <b>អត្ថបទ:</b> "${escapeHtml(previewText)}"`;

    const keyboard = buildQuickSwitchKeyboard(snippetId, voiceUsed);

    if (userSettings.audioMode === 'audio') {
      await ctx.replyWithAudio(
        { source: filePath, filename: `${voiceObj?.shortName || 'voice'}.mp3` },
        {
          caption,
          parse_mode: 'HTML',
          title: `Voice TTS (${voiceObj?.name})`,
          performer: voiceObj?.name,
          reply_markup: keyboard.reply_markup
        }
      );
    } else {
      await ctx.replyWithVoice(
        { source: filePath },
        {
          caption,
          parse_mode: 'HTML',
          reply_markup: keyboard.reply_markup
        }
      );
    }

    // Clean up temporary audio file
    cleanup();
  } catch (err) {
    console.error('TTS Error:', err);
    await ctx.reply(
      `❌ <b>បរាជ័យក្នុងការបំប្លែងទៅជាសំឡេង:</b>\n${escapeHtml(err.message)}\n\n💡 សូមសាកល្បងម្ដងទៀត ឬពិនិត្យមើលអត្ថបទរបស់អ្នក!`,
      { parse_mode: 'HTML' }
    );
  }
});

// Handle Audio & Voice Messages (STT)
bot.on(['voice', 'audio'], async (ctx) => {
  const userId = ctx.from.id;
  const userSettings = storage.getUserSettings(userId);

  const isVoice = !!ctx.message.voice;
  const fileObj = isVoice ? ctx.message.voice : ctx.message.audio;

  // Telegram limits bot downloads to 20MB
  if (fileObj.file_size && fileObj.file_size > 20 * 1024 * 1024) {
    return ctx.reply('⚠️ ឯកសារសំឡេងធំជាង ២០MB មិនអាចទាញយកបានទេ!');
  }

  // Send initial processing status message
  const statusMsg = await ctx.reply(
    `⏳ <b>កំពុងទាញយក និងបំប្លែងសំឡេងតាម Groq Whisper (whisper-large-v3)...</b>\nសូមរង់ចាំបន្តិច!`,
    { parse_mode: 'HTML' }
  );

  await ctx.sendChatAction('typing');

  try {
    const fileLink = await ctx.telegram.getFileLink(fileObj.file_id);
    const originalExt = isVoice ? 'ogg' : path.extname(fileObj.file_name || 'audio.mp3') || 'mp3';

    const result = await transcribeAudio(fileLink.href, originalExt);

    const { text, language, duration, srtContent, srtFilePath, cleanup } = result;

    if (!text || !text.trim()) {
      await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
      cleanup();
      return ctx.reply('⚠️ មិនអាចស្ដាប់ឮ ឬគ្មានអត្ថបទសំឡេងនៅក្នុងឯកសារនេះទេ!');
    }

    // Save snippet for callbacks (Download SRT / Speak Back)
    const snippetId = storage.saveSnippet(text, {
      srtContent,
      language,
      duration
    });

    const keyboard = buildSttResultKeyboard(snippetId);

    const formattedDuration = duration ? `${Math.round(duration)} វិនាទី` : 'មិនច្បាស់';
    const resultMessageText =
      `🎯 <b>លទ្ធផលបំប្លែងសំឡេង (Groq Whisper):</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🌐 <b>ភាសាស្វែងរកឃើញ:</b> ${escapeHtml(language)}\n` +
      `⏱️ <b>រយៈពេលសំឡេង:</b> ${escapeHtml(formattedDuration)}\n\n` +
      `📝 <b>អត្ថបទដែលបានបកប្រែ:</b>\n` +
      `"${escapeHtml(text)}"`;

    const sttFormat = userSettings.sttFormat || 'both';

    // Delete progress status message
    await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});

    // 1. Both: Send text + send SRT document
    if (sttFormat === 'both') {
      await ctx.replyWithHTML(resultMessageText, keyboard);
      if (fs.existsSync(srtFilePath)) {
        try {
          await ctx.replyWithDocument(
            { source: srtFilePath, filename: 'transcript_subtitles.srt' },
            { caption: '📄 <b>ឯកសារ Subtitle (.srt)</b>', parse_mode: 'HTML' }
          );
        } catch (docErr) {
          console.error('Failed to send SRT document:', docErr.message);
        }
      }
    }
    // 2. Text Only: Send text message only
    else if (sttFormat === 'text') {
      await ctx.replyWithHTML(resultMessageText, keyboard);
    }
    // 3. SRT Only: Send SRT document only
    else if (sttFormat === 'srt') {
      if (fs.existsSync(srtFilePath)) {
        await ctx.replyWithDocument(
          { source: srtFilePath, filename: 'transcript_subtitles.srt' },
          {
            caption:
              `📄 <b>ឯកសារ Subtitle (.srt)</b>\n` +
              `🌐 ភាសា: ${escapeHtml(language)} | ⏱️ រយៈពេល: ${escapeHtml(formattedDuration)}`,
            parse_mode: 'HTML',
            reply_markup: keyboard.reply_markup
          }
        );
      } else {
        await ctx.replyWithHTML(resultMessageText, keyboard);
      }
    }

    // Clean up temporary audio & srt files
    cleanup();
  } catch (err) {
    console.error('STT Error:', err);
    await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
    await ctx.reply(`❌ <b>បរាជ័យក្នុងការបំប្លែងសំឡេង (STT Error):</b>\n${escapeHtml(err.message)}`, {
      parse_mode: 'HTML'
    });
  }
});

// Global error handler
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
});

// Launch bot
bot.telegram.getMe().then((me) => {
  console.log('====================================');
  console.log('🤖 VoiceKhTTS Bot is RUNNING successfully!');
  console.log(`Bot username: @${me.username}`);
  console.log('Bot ID:', me.id);
  console.log('====================================');

  // Optional lightweight health check server if PORT is defined (e.g. Railway / Cloud Deployments)
  if (process.env.PORT) {
    const http = require('http');
    const port = process.env.PORT || 3000;
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'healthy', bot: `@${me.username}`, uptime: Math.floor(process.uptime()) }));
    });
    server.listen(port, () => {
      console.log(`🌐 Health check server listening on port ${port}`);
    });
  }

  return bot.launch();
}).catch((err) => {
  console.error('Failed to start bot:', err);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
