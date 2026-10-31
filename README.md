# 🤖 VoiceKhTTS Telegram Bot (TTS & STT)

Telegram Bot សម្រាប់បំប្លែង **Text-To-Speech (TTS)** ដោយប្រើ **Microsoft Edge Read Aloud Neural Voices** និងបំប្លែង **Speech-To-Text (STT)** ដោយប្រើ **Groq Whisper API (whisper-large-v3)** យ៉ាងលឿន និងមានគុណភាពខ្ពស់។

---

## 🌟 លក្ខណៈពិសេសចម្បង (Key Features)

### 1️⃣ Text-To-Speech (TTS)
- គាំទ្រសំឡេងភាសាខ្មែរ (Khmer Neural Voices):
  - 👨‍💼 **ពិសិដ្ឋ (Piseth - Male):** `km-KH-PisethNeural`
  - 👩‍💼 **ស្រីមុំ (Sreymom - Female):** `km-KH-SreymomNeural`
- គាំទ្រសំឡេងភាសាអង់គ្លេស (English Neural Voices):
  - 👩 **Jenny (Female - US):** `en-US-JennyNeural`
  - 👨 **Guy (Male - US):** `en-US-GuyNeural`
- **Auto-Detect Language:** បើ User វាយអក្សរខ្មែរ Bot ជ្រើសរើសសំឡេងខ្មែរដោយស្វ័យប្រវត្តិ បើជាអក្សរឡាតាំង/អង់គ្លេសជ្រើសរើសសំឡេងអង់គ្លេស។
- **ល្បឿននិយាយ (Speed Control):** 0.75x (យឺត), 1.0x (ធម្មតា), 1.25x (លឿនបន្តិច), 1.5x (លឿនខ្លាំង)។
- **ទម្រង់សំឡេង (Audio Format):**
  - 🎙️ **Voice Note:** បង្ហាញជារលកសំឡេង Telegram Voice Message ចុចស្ដាប់ភ្លាមៗ។
  - 🎵 **MP3 File:** ឯកសារ .mp3 ងាយស្រួលទាញយក ឬបញ្ជូនបន្ត (Forward)។
- **Quick Voice Switch Buttons:** ក្រោយពេលបង្កើតសំឡេងរួច មានប៊ូតុងចុចប្ដូរសំឡេងភ្លាមៗ (ឧ. ពីពិសិដ្ឋទៅស្រីមុំ ឬ Jenny) ដោយមិនបាច់វាយអក្សរម្ដងទៀត។

### 2️⃣ Speech-To-Text / Transcription (STT)
- ទទួលឯកសារសំឡេង **Voice Note** ឬឯកសារចម្រៀង **Audio (.mp3, .ogg, .m4a, .wav)**។
- បំប្លែងដោយប្រើ **Groq Whisper API (`whisper-large-v3`)** ដែលមានល្បឿនលឿន និងកម្រិតសុក្រឹតខ្ពស់។
- ជម្រើសទម្រង់លទ្ធផល (STT Format):
  1. **Both:** ផ្ញើទាំងអត្ថបទបកប្រែ និងភ្ជាប់ឯកសារ Subtitle `.srt`
  2. **Text Only:** ផ្ញើតែអត្ថបទបកប្រែ
  3. **SRT File Only:** ផ្ញើតែឯកសារ Subtitle `.srt`
- **Action Buttons:**
  - 📄 **Download .SRT Subtitles:** ទាញយកឯកសារ Subtitle .srt សម្រាប់យកទៅប្រើប្រាស់ក្នុងកម្មវិធីកាត់តវីដេអូ។
  - 🔊 **Speak Back (TTS):** ឱ្យ Bot អានអត្ថបទដែលបាន Transcribe នោះជាសំឡេងត្រឡប់មកវិញភ្លាមៗ!

---

## 📁 រចនាសម្ព័ន្ធគម្រោង (Project Structure)

```
voice-tg/
├── .env                  # Environment Variables (Bot Token & Groq API Key)
├── .env.example          # គំរូ File Environment Variables
├── config.js             # កំណត់រចនាសម្ព័ន្ធសំឡេង, ល្បឿន, ទម្រង់ STT & Audio
├── storage.js            # រក្សាទុកការកំណត់របស់អ្នកប្រើ (user_settings.json) & Cache
├── tts.js                # Logic បង្កើតសំឡេង Edge TTS + Auto-retry (Error 429)
├── stt.js                # Logic ទាញយកសំឡេង + Groq Whisper STT + បង្កើត .SRT
├── index.js              # Bot handlers, Commands, Callback Queries និង Events
├── user_settings.json    # Persistent JSON Database សម្រាប់ User Settings
├── package.json          # Node.js dependencies
└── README.md             # ឯកសារណែនាំ
```

---

## 🚀 របៀបដំឡើង និងដំណើរការ (Installation & Setup)

### ១. តម្រូវការជាមុន (Prerequisites)
- [Node.js](https://nodejs.org/) កំណែ 18 ឡើងទៅ (Node.js v20+ ឬ v26+ កាន់តែប្រសើរ)
- Telegram Bot Token ពី [@BotFather](https://t.me/BotFather)
- Groq Cloud API Key ពី [console.groq.com](https://console.groq.com)

### ២. ទាញយក និងដំឡើង Packages
```bash
npm install
```

### ៣. កំណត់ `.env` File
បង្កើត file `.env` (ឬប្រើ file `.env` ដែលមានស្រាប់):
```env
BOT_TOKEN=your_telegram_bot_token_here
GROQ_API_KEY=your_groq_api_key_here

DEFAULT_VOICE=auto
DEFAULT_KHMER_VOICE=km-KH-PisethNeural
DEFAULT_ENGLISH_VOICE=en-US-JennyNeural
DEFAULT_STT_FORMAT=both
DEFAULT_SPEED=1.0
DEFAULT_AUDIO_MODE=voice
```

### ៤. ដំណើរការ Bot (Run Bot)
```bash
npm start
```
ឬ៖
```bash
node index.js
```

---

## ⌨️ បញ្ជីពាក្យបញ្ជា (Bot Commands)

| ពាក្យបញ្ជា (Command) | ការពន្យល់ (Description) |
|---|---|
| `/start` | ចាប់ផ្ដើមប្រើប្រាស់ Bot និងបង្ហាញមឺនុយមេ |
| `/help` | បង្ហាញការណែនាំលម្អិតអំពីរបៀបប្រើប្រាស់ |
| `/voice` | បើកផ្ទាំងជ្រើសរើសសំឡេង (Auto, ពិសិដ្ឋ, ស្រីមុំ, Jenny, Guy) |
| `/speed` | បើកផ្ទាំងកំណត់ល្បឿននិយាយ (0.75x, 1.0x, 1.25x, 1.5x) |
| `/mode` | ប្ដូរទម្រង់សំឡេងរវាង Voice Note (សារសំឡេង) ឬ MP3 File |
| `/stt` | កំណត់ទម្រង់លទ្ធផល STT (Both, Text Only, SRT Only) |
| `/piseth` | ផ្លូវកាត់៖ ប្ដូរទៅសំឡេង ពិសិដ្ឋ (ប្រុស 🇰🇭) |
| `/sreymom` | ផ្លូវកាត់៖ ប្ដូរទៅសំឡេង ស្រីមុំ (ស្រី 🇰🇭) |
| `/jenny` | ផ្លូវកាត់៖ ប្ដូរទៅសំឡេង Jenny (ស្រី 🇺🇸) |
| `/guy` | ផ្លូវកាត់៖ ប្ដូរទៅសំឡេង Guy (ប្រុស 🇺🇸) |

---

## 🛠️ បច្ចេកវិទ្យាដែលប្រើ (Tech Stack)

- **[Telegraf](https://telegraf.js.org/):** Modern Telegram Bot Framework សម្រាប់ Node.js
- **[msedge-tts](https://www.npmjs.com/package/msedge-tts):** ប្រើ Microsoft Edge Read Aloud WebSocket API មិនគិតថ្លៃ និងសំឡេងច្បាស់ល្អឥតខ្ចោះ
- **[groq-sdk](https://www.npmjs.com/package/groq-sdk):** Groq Whisper Large v3 សម្រាប់ Speech-to-Text លឿនបំផុត
- **[dotenv](https://www.npmjs.com/package/dotenv):** គ្រប់គ្រង Environment Variables

