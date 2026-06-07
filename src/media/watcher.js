const chokidar = require('chokidar');
const library = require('./library');
const playlist = require('../stream/playlist');
const engine = require('../stream/engine');
const config = require('../config');

function start() {
  const watcher = chokidar.watch(config.mediaDir, {
    persistent: true,
    ignoreInitial: false,
    ignored: /(^|[/\\])\../, // ignore dot files (.DS_Store, .fc_tmp_*, etc.)
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 500 },
  });

  // Track in-flight normalizations. The update only runs when ALL pending
  // normalizes are done — otherwise a fast file triggers a rebuild before
  // slower files finish.
  let activeNormals = 0;
  let pendingUpdate = false;

  function maybeUpdate() {
    if (activeNormals > 0) return;
    if (!pendingUpdate) return;
    pendingUpdate = false;
    _updateStream();
  }

  watcher.on('add', async (filePath) => {
    activeNormals++;
    const added = await library.add(filePath);
    activeNormals--;
    if (added) pendingUpdate = true;
    maybeUpdate();
  });

  watcher.on('unlink', async (filePath) => {
    const removed = await library.remove(filePath);
    if (removed) {
      pendingUpdate = true;
      maybeUpdate();
    }
  });

  console.log(`[watcher] Watching ${config.mediaDir}`);
}

async function _updateStream() {
  const entries = library.getReadyEntries();
  if (entries.length === 0) {
    engine.stop();
    return;
  }
  await playlist.build(entries);
  if (!engine.isRunning()) {
    engine.start();
  } else {
    engine.restart();
  }
}

module.exports = { start };
