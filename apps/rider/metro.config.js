// Expo SDK 52+ resolves npm workspaces automatically.
const { getDefaultConfig } = require('expo/metro-config');
module.exports = getDefaultConfig(__dirname);
