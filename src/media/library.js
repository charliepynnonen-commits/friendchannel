const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { probe } = require('../stream/probe');
const { normalize } = require('./normalize');

const ALLOWED_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.m4v', '.wmv', '.flv', '.ts', '.webm']);

function createLibrary(libraryPath) {
  let library = { files: [] };

  async function load() {
    try {
      const raw = await fs.readFile(libraryPath, 'utf8');
      library = JSON.parse(raw);
    } catch {
      library = { files: [] };
    }

    const before = library.files.length;
    library.files = library.files.filter(f => fsSync.existsSync(f.path));
    const removed = before - library.files.length;
    if (removed > 0) {
      console.log(`[library] Pruned ${removed} missing file(s) from library`);
      await _save();
    }
  }

  async function _save() {
    await fs.mkdir(path.dirname(libraryPath), { recursive: true });
    await fs.writeFile(libraryPath, JSON.stringify(library, null, 2));
  }

  async function add(filePath) {
    if (library.files.some(f => f.path === filePath)) return null;

    const ext = path.extname(filePath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) return null;

    console.log(`[library] Normalizing ${path.basename(filePath)}...`);
    try {
      await normalize(filePath);
    } catch (err) {
      console.error(`[library] Normalize failed for ${path.basename(filePath)}:`, err.message);
      return null;
    }

    try {
      const info = await probe(filePath);
      const entry = {
        id: randomUUID(),
        filename: path.basename(filePath),
        path: filePath,
        ...info,
        status: 'ready',
        addedAt: new Date().toISOString(),
      };
      library.files.push(entry);
      await _save();
      const mins = Math.floor(info.duration / 60);
      const secs = Math.round(info.duration % 60);
      console.log(`[library] Added: ${entry.filename} (${mins}m${secs}s, ${info.codec})`);
      return entry;
    } catch (err) {
      console.error(`[library] Failed to probe ${path.basename(filePath)}:`, err.message);
      return null;
    }
  }

  async function remove(filePath) {
    const before = library.files.length;
    library.files = library.files.filter(f => f.path !== filePath);
    if (library.files.length !== before) {
      await _save();
      console.log(`[library] Removed: ${path.basename(filePath)}`);
      return true;
    }
    return false;
  }

  function getReadyEntries() {
    return library.files
      .filter(f => f.status === 'ready')
      .map(f => ({ path: f.path, duration: f.duration }));
  }

  function list() {
    return library.files;
  }

  return { load, add, remove, getReadyEntries, list };
}

module.exports = createLibrary;
