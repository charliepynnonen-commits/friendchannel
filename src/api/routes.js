const express = require('express');
const fs = require('fs');
const path = require('path');
const library = require('../media/library');
const engine = require('../stream/engine');
const registry = require('./registry');
const downloader = require('./downloader');
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

const router = express.Router();

router.get('/api/ping', (req, res) => {
  res.json({ ok: true, name: config.name, streaming: engine.isRunning() });
});

router.get('/api/status', (req, res) => {
  res.json({
    name: config.name,
    tailscaleIP: config.tailscaleIP,
    port: config.port,
    streaming: engine.isRunning(),
    mediaCount: library.list().length,
    iconURL: findIconURL(),
  });
});

router.get('/api/library', (req, res) => {
  res.json(library.list());
});

router.get('/api/channels', async (req, res) => {
  const remote = await registry.getChannels();

  const self = {
    id: registry.nodeId,
    name: config.name,
    tailscaleIP: config.tailscaleIP,
    port: config.port,
    isSelf: true,
    streaming: engine.isRunning(),
    iconURL: findIconURL(),
  };

  // Filter remote list to avoid self-duplication
  const others = remote.filter(c => c.id !== registry.nodeId);
  res.json([self, ...others]);
});

router.get('/playlist.m3u', async (req, res) => {
  const remote = await registry.getChannels();
  const self = {
    id: registry.nodeId,
    name: config.name,
    tailscaleIP: config.tailscaleIP,
    port: config.port,
    streaming: engine.isRunning(),
    iconURL: findIconURL(),
  };
  const all = [self, ...remote.filter(c => c.id !== registry.nodeId)];
  const online = all.filter(c => c.streaming);

  const lines = ['#EXTM3U'];
  for (const ch of online) {
    const logo = ch.iconURL ? ` tvg-logo="${ch.iconURL}"` : '';
    lines.push(`#EXTINF:-1${logo},${ch.name}`);
    lines.push(`http://${ch.tailscaleIP}:${ch.port}/stream/index.m3u8`);
  }

  res.setHeader('Content-Type', 'application/x-mpegurl');
  res.setHeader('Content-Disposition', 'inline; filename="friendchannel.m3u"');
  res.send(lines.join('\n') + '\n');
});

router.post('/api/download', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  if (!downloader.isInstalled()) {
    return res.status(503).json({ error: 'yt-dlp not installed. Run: brew install yt-dlp' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  downloader.download(url, (line) => send({ progress: line }))
    .then(() => { send({ done: true }); res.end(); })
    .catch((err) => { send({ error: err.message }); res.end(); });
});

module.exports = router;
