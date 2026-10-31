const fs = require('fs');
const path = require('path');
const config = require('./config');

const SETTINGS_FILE = path.join(__dirname, 'user_settings.json');

// In-memory cache for user settings to ensure quick lookups
let userSettingsCache = {};

// In-memory cache for recent TTS and STT snippets for inline callbacks
// Keeps callback_data string well under Telegram's 64-byte limit
const snippetStore = new Map();
const MAX_SNIPPETS = 500;
let snippetCounter = 1;

/**
 * Load settings from JSON file
 */
function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
      userSettingsCache = JSON.parse(data || '{}');
    } else {
      userSettingsCache = {};
      saveSettingsSync();
    }
  } catch (err) {
    console.error('Error loading user settings:', err);
    userSettingsCache = {};
  }
}

/**
 * Save settings to JSON file synchronously
 */
function saveSettingsSync() {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(userSettingsCache, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving user settings:', err);
  }
}

/**
 * Get settings for a user, filling in defaults where missing
 */
function getUserSettings(userId) {
  const id = String(userId);
  if (!userSettingsCache[id]) {
    userSettingsCache[id] = {
      voice: config.DEFAULT_VOICE,
      speed: config.DEFAULT_SPEED,
      audioMode: config.DEFAULT_AUDIO_MODE,
      sttFormat: config.DEFAULT_STT_FORMAT,
      createdAt: new Date().toISOString()
    };
    saveSettingsSync();
  }
  return { ...userSettingsCache[id] };
}

/**
 * Update settings for a specific user
 */
function updateUserSettings(userId, newSettings) {
  const id = String(userId);
  const current = getUserSettings(id);
  userSettingsCache[id] = {
    ...current,
    ...newSettings,
    updatedAt: new Date().toISOString()
  };
  saveSettingsSync();
  return userSettingsCache[id];
}

/**
 * Quick setting setters
 */
function setVoice(userId, voiceId) {
  return updateUserSettings(userId, { voice: voiceId });
}

function setSpeed(userId, speed) {
  return updateUserSettings(userId, { speed });
}

function setAudioMode(userId, audioMode) {
  return updateUserSettings(userId, { audioMode });
}

function setSttFormat(userId, sttFormat) {
  return updateUserSettings(userId, { sttFormat });
}

/**
 * Save a text snippet for inline button callbacks
 * @param {string} text - text to store
 * @param {object} meta - additional metadata (e.g. language, duration, segments)
 * @returns {string} snippetId
 */
function saveSnippet(text, meta = {}) {
  // Rotate cache if over limit
  if (snippetStore.size >= MAX_SNIPPETS) {
    const firstKey = snippetStore.keys().next().value;
    snippetStore.delete(firstKey);
  }

  const id = (snippetCounter++).toString(36);
  snippetStore.set(id, {
    id,
    text: text || '',
    meta,
    createdAt: Date.now()
  });
  return id;
}

/**
 * Get a saved snippet by its ID
 */
function getSnippet(id) {
  return snippetStore.get(String(id)) || null;
}

// Initial load
loadSettings();

module.exports = {
  getUserSettings,
  updateUserSettings,
  setVoice,
  setSpeed,
  setAudioMode,
  setSttFormat,
  saveSnippet,
  getSnippet
};

