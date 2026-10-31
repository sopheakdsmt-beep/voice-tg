const fs = require('fs');
const path = require('path');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const config = require('./config');

const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Determine the actual voice to use given the user voice setting and the text
 */
function resolveVoice(voiceSetting, text) {
  if (voiceSetting && voiceSetting !== 'auto' && config.VOICES[voiceSetting]) {
    return voiceSetting;
  }
  // Auto-detection based on script
  const isKhmer = config.hasKhmerText(text);
  return isKhmer ? config.DEFAULT_KHMER_VOICE : config.DEFAULT_ENGLISH_VOICE;
}

/**
 * Map speed value to Edge TTS rate string
 */
function resolveRate(speed) {
  const speedObj = config.SPEEDS[String(speed)];
  if (speedObj) return speedObj.rate;
  return '+0%';
}

/**
 * Delay helper for retries
 */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Synthesize speech from text using Edge TTS with auto-retry
 *
 * @param {object} options
 * @param {string} options.text - Text to synthesize
 * @param {string} [options.voice] - Voice ID or 'auto'
 * @param {string} [options.speed] - Speed ('0.75', '1.0', '1.25', '1.5')
 * @param {number} [options.maxRetries=3] - Maximum retry attempts
 * @returns {Promise<{ filePath: string, voiceUsed: string, cleanup: Function }>}
 */
async function synthesizeSpeech({ text, voice = 'auto', speed = '1.0', maxRetries = 3 }) {
  if (!text || !text.trim()) {
    throw new Error('អត្ថបទទំនេរ មិនអាចបំប្លែងទៅជាសំឡេងបានទេ (Empty text)');
  }

  const voiceToUse = resolveVoice(voice, text);
  const rateToUse = resolveRate(speed);

  // Unique working directory for this synthesis inside temp to avoid collisions
  const runId = `tts_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const runDir = path.join(TEMP_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });

  let attempt = 0;
  let lastError = null;

  while (attempt < maxRetries) {
    attempt++;
    let tts = null;
    try {
      tts = new MsEdgeTTS();
      await tts.setMetadata(voiceToUse, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

      const result = await tts.toFile(runDir, text, {
        rate: rateToUse
      });

      // Close the WebSocket connection cleanly
      try {
        tts.close();
      } catch (_) {}

      const generatedAudioPath = result.audioFilePath;
      // Rename to descriptive mp3 file inside runDir
      const finalAudioPath = path.join(runDir, `${runId}.mp3`);
      if (fs.existsSync(generatedAudioPath)) {
        if (generatedAudioPath !== finalAudioPath) {
          fs.renameSync(generatedAudioPath, finalAudioPath);
        }
      }

      return {
        filePath: finalAudioPath,
        voiceUsed: voiceToUse,
        cleanup: () => {
          try {
            if (fs.existsSync(runDir)) {
              fs.rmSync(runDir, { recursive: true, force: true });
            }
          } catch (e) {
            console.error(`Failed to cleanup temp dir ${runDir}:`, e.message);
          }
        }
      };
    } catch (err) {
      lastError = err;
      if (tts) {
        try {
          tts.close();
        } catch (_) {}
      }

      const isRateLimited =
        err.message && (err.message.includes('429') || err.message.toLowerCase().includes('rate limit'));
      console.warn(`TTS attempt ${attempt} failed: ${err.message}. ${isRateLimited ? 'Rate limited!' : ''}`);

      if (attempt < maxRetries) {
        // Exponential backoff: 1.5s, 3s...
        const backoffMs = Math.pow(2, attempt) * 1000;
        await wait(backoffMs);
      }
    }
  }

  // Cleanup directory if all attempts failed
  try {
    if (fs.existsSync(runDir)) {
      fs.rmSync(runDir, { recursive: true, force: true });
    }
  } catch (_) {}

  throw new Error(`បរាជ័យក្នុងការបង្កើតសំឡេង (TTS Error): ${lastError ? lastError.message : 'Unknown error'}`);
}

module.exports = {
  synthesizeSpeech,
  resolveVoice,
  resolveRate
};

