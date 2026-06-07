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
    signal: AbortSignal.timeout(5000),
  });
}

async function register(streaming) {
  if (!config.registryURL) return;
  try {
    await _post('/register', {
      id: nodeId,
      name: config.name,
      tailscaleIP: config.tailscaleIP,
      port: config.port,
      streaming: !!streaming,
      iconURL: findIconURL(),
    });
  } catch (err) {
    console.warn('[registry] Heartbeat failed:', err.message);
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
  const engine = require('../stream/engine');
  const beat = () => register(engine.isRunning());
  beat();
  intervalId = setInterval(beat, 60_000);
}

function stop() {
  clearInterval(intervalId);
}

module.exports = { start, stop, register, unregister, getChannels, nodeId };
