const chokidar = require('chokidar');
const library = require('./library');
const playlist = require('../stream/playlist');
const engine = require('../stream/engine');
const config = require('../config');

function start() {
  const watcher = chokidar.watch(config.mediaDir, {
    persistent: true,
    ignoreInitial: false,
    // Wait for file to finish writing before processing
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 500 },
  });

  watcher.on('add', async (filePath) => {
    const added = await library.add(filePath);
    if (added) await _updateStream();
  });

  watcher.on('unlink', async (filePath) => {
    await library.remove(filePath);
    await _updateStream();
  });

  console.log(`[watcher] Watching ${config.mediaDir}`);
}

async function _updateStream() {
  const files = library.getReadyFiles();
  if (files.length === 0) {
    engine.stop();
    return;
  }
  await playlist.build(files);
  if (!engine.isRunning()) {
    engine.start();
  } else {
    // Concat demuxer caches the file list at startup — must restart to pick up changes
    engine.restart();
  }
}

module.exports = { start };
