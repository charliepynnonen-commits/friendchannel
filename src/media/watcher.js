const chokidar = require('chokidar');

function createWatcher(mediaDir, library, onUpdate, opts = {}) {
  const watcher = chokidar.watch(mediaDir, {
    persistent: true,
    ignoreInitial: false,
    ignored: /(^|[/\\])\../,
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 500 },
    depth: opts.depth,
  });

  // Serialize normalizations — one at a time so each encode gets full CPU.
  // activeNormals counts queued+running work; onUpdate only fires when all done.
  let activeNormals = 0;
  let pendingUpdate = false;
  const normalizeQueue = [];
  let queueRunning = false;

  function maybeUpdate() {
    if (activeNormals > 0) return;
    if (!pendingUpdate) return;
    pendingUpdate = false;
    onUpdate();
  }

  async function drainQueue() {
    if (queueRunning) return;
    queueRunning = true;
    while (normalizeQueue.length > 0) {
      const { filePath, resolve } = normalizeQueue.shift();
      const added = await library.add(filePath);
      resolve(added);
    }
    queueRunning = false;
  }

  watcher.on('add', async (filePath) => {
    activeNormals++;
    const added = await new Promise(resolve => {
      normalizeQueue.push({ filePath, resolve });
      drainQueue();
    });
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

  console.log(`[watcher] Watching ${mediaDir}`);
  return watcher;
}

module.exports = createWatcher;
