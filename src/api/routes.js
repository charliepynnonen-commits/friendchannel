const express = require('express');
const fs = require('fs');
const path = require('path');
const channels = require('../channels');
const registry = require('./registry');
const downloader = require('./downloader');
const display = require('./display');
const config = require('../config');

const ICON_FILES = ['icon.gif', 'icon.png', 'icon.webp'];

function findIconURL(iconDir, slug) {
  if (!iconDir) return null;
  for (const file of ICON_FILES) {
    if (fs.existsSync(path.join(iconDir, file))) {
      const urlPath = slug ? `/channel/${slug}/${file}` : `/channel/${file}`;
      return `http://${config.tailscaleIP}:${config.port}${urlPath}`;
    }
  }
  return null;
}

function streamPath(slug) {
  return slug ? `/stream/${slug}/index.m3u8` : '/stream/index.m3u8';
}

// URL uses 'default' for the null-slug default channel
function resolveSlug(param) {
  return param === 'default' ? null : param;
}

const router = express.Router();

// Serve named-channel icon files (e.g. data/channels/foo/icon.gif → /channel/foo/icon.gif).
// Default-channel icons are handled by the /channel static mount in server.js.
router.get('/channel/:slug/icon.:ext', (req, res, next) => {
  if (!['gif', 'png', 'webp'].includes(req.params.ext)) return next();
  const ch = channels.get(req.params.slug);
  if (!ch || !ch.iconDir) return res.status(404).end();
  const file = path.resolve(path.join(ch.iconDir, `icon.${req.params.ext}`));
  if (!fs.existsSync(file)) return res.status(404).end();
  res.sendFile(file);
});

router.get('/api/ping', (req, res) => {
  const streaming = channels.getAll().some(ch => ch.isRunning());
  res.json({ ok: true, name: config.name, streaming });
});

router.get('/api/status', (req, res) => {
  const defaultCh = channels.get(null);
  res.json({
    name: config.name,
    tailscaleIP: config.tailscaleIP,
    port: config.port,
    streaming: channels.getAll().some(ch => ch.isRunning()),
    mediaCount: defaultCh ? defaultCh.list().length : 0,
    iconURL: defaultCh ? findIconURL(defaultCh.iconDir, null) : null,
  });
});

router.get('/api/library', (req, res) => {
  const defaultCh = channels.get(null);
  res.json(defaultCh ? defaultCh.list() : []);
});

router.get('/api/channels', async (req, res) => {
  const remote = await registry.getChannels();

  const selfChannels = channels.getAll().map(ch => ({
    id: `${registry.nodeId}-${ch.slug || 'default'}`,
    nodeId: registry.nodeId,
    name: ch.slug ? ch.name : config.name,
    slug: ch.slug,
    streamPath: streamPath(ch.slug),
    tailscaleIP: config.tailscaleIP,
    port: config.port,
    streaming: ch.isRunning(),
    iconURL: findIconURL(ch.iconDir, ch.slug),
    isSelf: true,
  }));

  const remoteChannels = remote
    .filter(node => node.id !== registry.nodeId)
    .flatMap(node => {
      // New multi-channel nodes advertise a channels array
      if (node.channels && node.channels.length > 0) {
        return node.channels.map(ch => ({
          id: `${node.id}-${ch.slug || 'default'}`,
          nodeId: node.id,
          name: ch.name,
          slug: ch.slug,
          streamPath: streamPath(ch.slug),
          tailscaleIP: node.tailscaleIP,
          port: node.port,
          streaming: ch.streaming,
          iconURL: node.iconURL,
          isSelf: false,
        }));
      }
      // Old node without channels array — treat as single default channel
      return [{
        id: node.id,
        nodeId: node.id,
        name: node.name,
        slug: null,
        streamPath: '/stream/index.m3u8',
        tailscaleIP: node.tailscaleIP,
        port: node.port,
        streaming: node.streaming,
        iconURL: node.iconURL,
        isSelf: false,
      }];
    });

  res.json([...selfChannels, ...remoteChannels]);
});

router.get('/playlist.m3u', async (req, res) => {
  const remote = await registry.getChannels();

  const selfChannels = channels.getAll()
    .filter(ch => ch.isRunning())
    .map(ch => ({
      name: ch.slug ? ch.name : config.name,
      slug: ch.slug,
      tailscaleIP: config.tailscaleIP,
      port: config.port,
      iconURL: findIconURL(ch.iconDir, ch.slug),
    }));

  const remoteChannels = remote
    .filter(node => node.id !== registry.nodeId)
    .flatMap(node => {
      if (node.channels && node.channels.length > 0) {
        return node.channels
          .filter(ch => ch.streaming)
          .map(ch => ({
            name: ch.name,
            slug: ch.slug,
            tailscaleIP: node.tailscaleIP,
            port: node.port,
            iconURL: node.iconURL,
          }));
      }
      if (!node.streaming) return [];
      return [{ name: node.name, slug: null, tailscaleIP: node.tailscaleIP, port: node.port, iconURL: node.iconURL }];
    });

  const all = [...selfChannels, ...remoteChannels];
  const lines = ['#EXTM3U'];
  for (const ch of all) {
    const logo = ch.iconURL ? ` tvg-logo="${ch.iconURL}"` : '';
    lines.push(`#EXTINF:-1${logo},${ch.name}`);
    lines.push(`http://${ch.tailscaleIP}:${ch.port}${streamPath(ch.slug)}`);
  }

  res.setHeader('Content-Type', 'application/x-mpegurl');
  res.setHeader('Content-Disposition', 'inline; filename="friendchannel.m3u"');
  res.send(lines.join('\n') + '\n');
});

router.get('/api/display', (req, res) => {
  res.json(display.status());
});

router.post('/api/display/start', (req, res) => {
  const { url, name } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  if (!display.isInstalled()) return res.status(503).json({ error: 'mpv not installed' });
  display.start(url, name || url);
  res.json({ ok: true });
});

router.post('/api/display/stop', (req, res) => {
  display.stop();
  res.json({ ok: true });
});

router.get('/api/channel/:slug/library', (req, res) => {
  const ch = channels.get(resolveSlug(req.params.slug));
  if (!ch) return res.status(404).json({ error: 'channel not found' });
  res.json(ch.list());
});

router.post('/api/channel/:slug/snooze', async (req, res) => {
  const ch = channels.get(resolveSlug(req.params.slug));
  if (!ch) return res.status(404).json({ error: 'channel not found' });
  const { id, hours = 24 } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });
  const ok = await ch.snooze(id, hours);
  if (!ok) return res.status(404).json({ error: 'entry not found' });
  res.json({ ok: true });
});

router.post('/api/channel/:slug/unsnooze', async (req, res) => {
  const ch = channels.get(resolveSlug(req.params.slug));
  if (!ch) return res.status(404).json({ error: 'channel not found' });
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });
  const ok = await ch.unsnooze(id);
  if (!ok) return res.status(404).json({ error: 'entry not found' });
  res.json({ ok: true });
});

router.post('/api/download', (req, res) => {
  const { url, slug } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  const targetChannel = slug ? channels.get(slug) : channels.get(null);
  if (!targetChannel) return res.status(400).json({ error: 'unknown channel' });
  const targetDir = targetChannel.mediaDir;

  if (!downloader.isInstalled()) {
    return res.status(503).json({ error: 'yt-dlp not installed. Run: brew install yt-dlp' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  downloader.download(url, targetDir, (line) => send({ progress: line }))
    .then(() => { send({ done: true }); res.end(); })
    .catch((err) => { send({ error: err.message }); res.end(); });
});

module.exports = router;
