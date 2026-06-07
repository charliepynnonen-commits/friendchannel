require('dotenv').config();
const express = require('express');
const fs = require('fs/promises');
const config = require('./src/config');
const library = require('./src/media/library');
const playlist = require('./src/stream/playlist');
const engine = require('./src/stream/engine');
const watcher = require('./src/media/watcher');
const registry = require('./src/api/registry');
const routes = require('./src/api/routes');

async function main() {
  await fs.mkdir(config.mediaDir, { recursive: true });
  await fs.mkdir(config.hlsDir, { recursive: true });
  await fs.mkdir(config.channelDir, { recursive: true });

  await library.load();

  const entries = library.getReadyEntries();
  if (entries.length > 0) {
    await playlist.build(entries);
    engine.start();
  } else {
    console.log('[server] No media yet — drop video files into data/media/ to begin streaming.');
  }

  const app = express();
  app.use(express.json());

  // Allow cross-origin requests so friends' browsers can fetch our stream
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
  });

  // Serve HLS segments with correct MIME types and no caching on the manifest
  app.use('/stream', express.static(config.hlsDir, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.m3u8')) {
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache, no-store');
      } else if (filePath.endsWith('.ts')) {
        res.setHeader('Content-Type', 'video/mp2t');
      }
    },
  }));

  app.use('/channel', express.static(config.channelDir));
  app.use(express.static('public'));
  app.use(routes);

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`\n[server] FriendChannel "${config.name}" is live`);
    console.log(`[server]   Local:     http://localhost:${config.port}`);
    console.log(`[server]   Network:   http://${config.tailscaleIP}:${config.port}`);
    console.log(`[server]   Stream:    http://${config.tailscaleIP}:${config.port}/stream/index.m3u8\n`);
  });

  watcher.start();

  if (config.registryURL) {
    registry.start();
    console.log(`[registry] Connected to ${config.registryURL}`);
  } else {
    console.log('[registry] No REGISTRY_URL set — running in local-only mode');
  }

  const shutdown = async (signal) => {
    console.log(`\n[server] Received ${signal}, shutting down...`);
    engine.stop();
    registry.stop();
    await registry.unregister();
    process.exit(0);
  };
  process.on('SIGINT', shutdown.bind(null, 'SIGINT'));
  process.on('SIGTERM', shutdown.bind(null, 'SIGTERM'));
}

main().catch(err => {
  console.error('[server] Fatal:', err);
  process.exit(1);
});
