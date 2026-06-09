const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const config = require('../config');

const ICON_FILES = ['icon.gif', 'icon.png', 'icon.webp'];

function findIconURL() {
  for (const file of ICON_FILES) {
    if (fs.existsSync(path.join(config.channelDir, file))) {
      return `http://${config.tailscaleIP}:${config.port}/channel/${file}`;
    }
  }
  return null;
}

const nodeId = randomUUID();
let intervalId = null;

async function _post(path, body) {
  return fetch(`${config.registryURL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
}

async function register() {
  if (!config.registryURL) return;
  const channels = require('../channels');
  const all = channels.getAll();
  const body = {
    id: nodeId,
    name: config.name,
    tailscaleIP: config.tailscaleIP,
    port: config.port,
    streaming: all.some(ch => ch.isRunning()),
    iconURL: findIconURL(),
    channels: all.map(ch => ({
      slug: ch.slug,
      name: ch.slug ? ch.name : config.name,
      streaming: ch.isRunning(),
    })),
  };
  // Two attempts — first may time out waking the Fly.io machine from sleep
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await _post('/register', body);
      return;
    } catch (err) {
      if (attempt === 2) console.warn('[registry] Heartbeat failed:', err.message);
      else await new Promise(r => setTimeout(r, 3000));
    }
  }
}

async function unregister() {
  if (!config.registryURL) return;
  try {
    await fetch(`${config.registryURL}/register/${nodeId}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(5000),
    });
  } catch {}
}

async function getChannels() {
  if (!config.registryURL) return [];
  try {
    const res = await fetch(`${config.registryURL}/channels`, {
      signal: AbortSignal.timeout(5000),
    });
    return await res.json();
  } catch {
    return [];
  }
}

function start() {
  register();
  intervalId = setInterval(register, 60_000);
}

function stop() {
  clearInterval(intervalId);
}

module.exports = { start, stop, register, unregister, getChannels, nodeId };
