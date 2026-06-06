const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { probe } = require('../stream/probe');
const config = require('../config');

let library = { files: [] };

const ALLOWED_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.m4v', '.wmv', '.flv', '.ts', '.webm']);

async function load() {
  try {
    const raw = await fs.readFile(config.libraryPath, 'utf8');
    library = JSON.parse(raw);
  } catch {
    library = { files: [] };
  }

  // Remove entries for files that no longer exist on disk
  const before = library.files.length;
  library.files = library.files.filter(f => fsSync.existsSync(f.path));
  const removed = before - library.files.length;
  if (removed > 0) {
    console.log(`[library] Pruned ${removed} missing file(s) from library`);
    await _save();
  }
}

async function _save() {
  await fs.writeFile(config.libraryPath, JSON.stringify(library, null, 2));
}

async function add(filePath) {
  if (library.files.some(f => f.path === filePath)) return null;

  const ext = path.extname(filePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) return null;

  console.log(`[library] Probing ${path.basename(filePath)}...`);
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
  }
}

function getReadyFiles() {
  return library.files.filter(f => f.status === 'ready').map(f => f.path);
}

function list() {
  return library.files;
}

module.exports = { load, add, remove, getReadyFiles, list };
