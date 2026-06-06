const chokidar = require('chokidar');
const library = require('./library');
const prerender = require('../stream/prerender');
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
  // normalizes are done — otherwise a fast file triggers a rebuild before slow
  // files finish, and the loop is built with an incomplete library.
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
  const files = library.getReadyFiles();
  if (files.length === 0) {
    engine.stop();
    return;
  }
  // Stop the stream, rebuild loop.mp4, then start fresh.
  // The rebuild is fast (~10s) since files are already normalized to H264 + AAC.
  engine.stop();
  await prerender.build(files);
  engine.start();
}

module.exports = { start };
