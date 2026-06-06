require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

function detectTailscaleIP() {
  try {
    return execSync('tailscale ip -4 2>/dev/null', { timeout: 2000 }).toString().trim();
  } catch {
    return null;
  }
}

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');

module.exports = {
  name: process.env.NODE_NAME || os.hostname(),
  port: parseInt(process.env.PORT || '7777', 10),
  tailscaleIP: process.env.TAILSCALE_IP || detectTailscaleIP() || 'localhost',
  registryURL: process.env.REGISTRY_URL || null,
  dataDir: DATA_DIR,
  mediaDir: path.join(DATA_DIR, 'media'),
  hlsDir: path.join(DATA_DIR, 'hls'),
  channelDir: path.join(DATA_DIR, 'channel'),
  playlistPath: path.join(DATA_DIR, 'playlist.ffconcat'),
  loopPath: path.join(DATA_DIR, 'loop.mp4'),
  libraryPath: path.join(DATA_DIR, 'library.json'),
};
