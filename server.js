require('dotenv').config();
const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const config = require('./src/config');
const Channel = require('./src/channel');
const channels = require('./src/channels');
const registry = require('./src/api/registry');
const display = require('./src/api/display');
const routes = require('./src/api/routes');

async function main() {
  await fs.mkdir(config.mediaDir, { recursive: true });
  await fs.mkdir(config.channelDir, { recursive: true });

  // Default channel: watches root of mediaDir at depth 0 so subdirs (named channels) are ignored.
  const defaultChannel = new Channel({
    slug: null,
    name: config.name,
    mediaDir: config.mediaDir,
    dataDir: config.dataDir,
    hlsDir: config.hlsDir,
    iconDir: config.channelDir,
  });
  channels.add(null, defaultChannel);
  await defaultChannel.start();

  // Named channels: each subdirectory of mediaDir becomes an independent channel.
  const entries = await fs.readdir(config.mediaDir, { withFileTypes: true });
  for (const entry of entries.filter(e => e.isDirectory())) {
    const slug = entry.name;
    const ch = new Channel({
      slug,
      name: null,
      mediaDir: path.join(config.mediaDir, slug),
      dataDir: path.join(config.dataDir, 'channels', slug),
      hlsDir: path.join(config.hlsDir, slug),
      iconDir: path.join(config.dataDir, 'channels', slug),
    });
    channels.add(slug, ch);
    await ch.start();
  }

  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
  });

  // Single static mount covers both default (/stream/index.m3u8) and named (/stream/<slug>/index.m3u8)
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
    const all = channels.getAll();
    console.log(`\n[server] FriendChannel "${config.name}" is live — ${all.length} channel(s)`);
    console.log(`[server]   Local:   http://localhost:${config.port}`);
    console.log(`[server]   Network: http://${config.tailscaleIP}:${config.port}`);
    for (const ch of all) {
      const streamPath = ch.slug ? `/stream/${ch.slug}/index.m3u8` : '/stream/index.m3u8';
      console.log(`[server]   ${(ch.slug || 'default').padEnd(12)} http://${config.tailscaleIP}:${config.port}${streamPath}`);
    }
    console.log();
  });

  if (config.registryURL) {
    registry.start();
    console.log(`[registry] Connected to ${config.registryURL}`);
  } else {
    console.log('[registry] No REGISTRY_URL set — running in local-only mode');
  }

  const shutdown = async (signal) => {
    console.log(`\n[server] Received ${signal}, shutting down...`);
    display.stop();
    channels.getAll().forEach(ch => ch.stop());
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
