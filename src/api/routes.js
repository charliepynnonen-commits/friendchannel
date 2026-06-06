const express = require('express');
const fs = require('fs');
const path = require('path');
const library = require('../media/library');
const engine = require('../stream/engine');
const registry = require('./registry');
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

module.exports = router;
