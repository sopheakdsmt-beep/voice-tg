require('dotenv').config();

const VOICES = {
  'km-KH-PisethNeural': {
    id: 'km-KH-PisethNeural',
    shortName: 'piseth',
    name: 'Piseth (ពិសិដ្ឋ)',
    gender: 'ប្រុស (Male)',
    lang: 'km',
    langName: 'ភាសាខ្មែរ (Khmer)',
    flag: '🇰🇭',
    icon: '👨‍💼',
    description: 'សំឡេងប្រុសខ្មែរ (ច្បាស់ និងទន់ភ្លន់)'
  },
  'km-KH-SreymomNeural': {
    id: 'km-KH-SreymomNeural',
    shortName: 'sreymom',
    name: 'Sreymom (ស្រីមុំ)',
    gender: 'ស្រី (Female)',
    lang: 'km',
    langName: 'ភាសាខ្មែរ (Khmer)',
    flag: '🇰🇭',
    icon: '👩‍💼',
    description: 'សំឡេងស្រីខ្មែរ (ផ្អែមល្ហែម និងច្បាស់)'
  },
  'en-US-JennyNeural': {
    id: 'en-US-JennyNeural',
    shortName: 'jenny',
    name: 'Jenny (US)',
    gender: 'ស្រី (Female)',
    lang: 'en',
    langName: 'ភាសាអង់គ្លេស (English)',
    flag: '🇺🇸',
    icon: '👩',
    description: 'សំឡេងស្រីអង់គ្លេសបែបអាមេរិក'
  },
  'en-US-GuyNeural': {
    id: 'en-US-GuyNeural',
    shortName: 'guy',
    name: 'Guy (US)',
    gender: 'ប្រុស (Male)',
    lang: 'en',
    langName: 'ភាសាអង់គ្លេស (English)',
    flag: '🇺🇸',
    icon: '👨',
    description: 'សំឡេងប្រុសអង់គ្លេសបែបអាមេរិក'
  }
};

const SPEEDS = {
  '0.75': {
    value: '0.75',
    label: '0.75x',
    rate: '-25%',
    description: 'យឺត (Slow)'
  },
  '1.0': {
    value: '1.0',
    label: '1.0x',
    rate: '+0%',
    description: 'ធម្មតា (Normal)'
  },
  '1.25': {
    value: '1.25',
    label: '1.25x',
    rate: '+25%',
    description: 'លឿនបន្តិច (Fast)'
  },
  '1.5': {
    value: '1.5',
    label: '1.5x',
    rate: '+50%',
    description: 'លឿនខ្លាំង (Faster)'
  }
};

const AUDIO_MODES = {
  voice: {
    id: 'voice',
    name: 'Voice Note (សារសំឡេង)',
    icon: '🎙️',
    description: 'ចាក់ភ្លាមៗក្នុង Telegram ជា Voice Waveform'
  },
  audio: {
    id: 'audio',
    name: 'MP3 Audio (ឯកសារសំឡេង)',
    icon: '🎵',
    description: 'ឯកសារ .mp3 អាចទាញយក និង Forward ងាយស្រួល'
  }
};

const STT_FORMATS = {
  both: {
    id: 'both',
    name: 'Both (អត្ថបទ + .SRT)',
    icon: '📝+📄',
    description: 'ផ្ញើទាំងអត្ថបទ និងឯកសារ .srt Subtitle'
  },
  text: {
    id: 'text',
    name: 'Text Only (អត្ថបទ)',
    icon: '📝',
    description: 'ផ្ញើតែអត្ថបទ Transcribe'
  },
  srt: {
    id: 'srt',
    name: 'SRT Only (ឯកសារ .SRT)',
    icon: '📄',
    description: 'ផ្ញើតែឯកសារ .srt Subtitle'
  }
};

/**
 * Detect if text contains Khmer script characters
 * Unicode range for Khmer: \u1780-\u17FF and Symbols \u19E0-\u19FF
 */
function hasKhmerText(text) {
  if (!text || typeof text !== 'string') return false;
  return /[\u1780-\u17FF\u19E0-\u19FF]/.test(text);
}

module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  DEFAULT_VOICE: process.env.DEFAULT_VOICE || 'auto',
  DEFAULT_KHMER_VOICE: process.env.DEFAULT_KHMER_VOICE || 'km-KH-PisethNeural',
  DEFAULT_ENGLISH_VOICE: process.env.DEFAULT_ENGLISH_VOICE || 'en-US-JennyNeural',
  DEFAULT_STT_FORMAT: process.env.DEFAULT_STT_FORMAT || 'both',
  DEFAULT_SPEED: process.env.DEFAULT_SPEED || '1.0',
  DEFAULT_AUDIO_MODE: process.env.DEFAULT_AUDIO_MODE || 'voice',
  VOICES,
  SPEEDS,
  AUDIO_MODES,
  STT_FORMATS,
  hasKhmerText
};

