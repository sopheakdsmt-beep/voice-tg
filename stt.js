const fs = require('fs');
const path = require('path');
const Groq = require('groq-sdk');
const config = require('./config');

const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Initialize Groq client
const groq = new Groq({
  apiKey: config.GROQ_API_KEY
});

/**
 * Format seconds to SRT timestamp: HH:MM:SS,mmm
 */
function formatSrtTime(seconds) {
  const totalMs = Math.max(0, Math.round((Number(seconds) || 0) * 1000));
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);

  const pad = (n, width = 2) => String(n).padStart(width, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

/**
 * Convert transcription segments to standard SRT format string
 */
function generateSrt(segments, fullText = '', duration = 0) {
  if (Array.isArray(segments) && segments.length > 0) {
    return segments
      .map((seg, idx) => {
        const start = formatSrtTime(seg.start);
        const end = formatSrtTime(seg.end || (seg.start + 2));
        const text = (seg.text || '').trim();
        return `${idx + 1}\n${start} --> ${end}\n${text}\n`;
      })
      .join('\n');
  }

  // Fallback if no segments provided
  const start = formatSrtTime(0);
  const end = formatSrtTime(duration || 5);
  return `1\n${start} --> ${end}\n${(fullText || '').trim()}\n`;
}

/**
 * Download audio from URL and save to a temporary file
 */
async function downloadAudio(fileUrl, preferredExtension = 'ogg') {
  const runId = `audio_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const ext = preferredExtension.startsWith('.') ? preferredExtension.slice(1) : preferredExtension;
  const filePath = path.join(TEMP_DIR, `${runId}.${ext}`);

  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`ទាញយកឯកសារសំឡេងបរាជ័យ (HTTP ${response.status}: ${response.statusText})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  await fs.promises.writeFile(filePath, Buffer.from(arrayBuffer));
  return filePath;
}

/**
 * Transcribe an audio file using Groq Whisper API (whisper-large-v3)
 *
 * @param {string} audioUrl - URL to download the audio from
 * @param {string} [extensionHint='ogg'] - File extension hint (.ogg, .mp3, etc.)
 * @returns {Promise<{
 *   text: string,
 *   language: string,
 *   duration: number,
 *   segments: Array,
 *   srtContent: string,
 *   srtFilePath: string,
 *   cleanup: Function
 * }>}
 */
async function transcribeAudio(audioUrl, extensionHint = 'ogg') {
  // Normalize extension for Whisper API compatibility
  let ext = (extensionHint || 'ogg').toLowerCase().replace('.', '');
  if (ext === 'oga') ext = 'ogg'; // map Telegram voice oga to ogg

  const audioFilePath = await downloadAudio(audioUrl, ext);
  const srtFilePath = audioFilePath.replace(new RegExp(`\\.${ext}$`), '.srt');

  try {
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(audioFilePath),
      model: 'whisper-large-v3',
      response_format: 'verbose_json'
    });

    const fullText = (transcription.text || '').trim();
    const language = transcription.language || 'Unknown';
    const duration = transcription.duration || 0;
    const segments = transcription.segments || [];

    const srtContent = generateSrt(segments, fullText, duration);
    await fs.promises.writeFile(srtFilePath, srtContent, 'utf8');

    return {
      text: fullText,
      language,
      duration,
      segments,
      srtContent,
      srtFilePath,
      cleanup: () => {
        try {
          if (fs.existsSync(audioFilePath)) fs.unlinkSync(audioFilePath);
        } catch (_) {}
        try {
          if (fs.existsSync(srtFilePath)) fs.unlinkSync(srtFilePath);
        } catch (_) {}
      }
    };
  } catch (err) {
    // Clean up temporary audio file on error
    try {
      if (fs.existsSync(audioFilePath)) fs.unlinkSync(audioFilePath);
    } catch (_) {}
    try {
      if (fs.existsSync(srtFilePath)) fs.unlinkSync(srtFilePath);
    } catch (_) {}

    throw new Error(`Groq Whisper Error: ${err.message}`);
  }
}

module.exports = {
  transcribeAudio,
  generateSrt,
  formatSrtTime
};

