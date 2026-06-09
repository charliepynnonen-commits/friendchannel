const path = require('path');
const fs = require('fs/promises');
const createLibrary = require('./media/library');
const createEngine = require('./stream/engine');
const { build: buildPlaylist } = require('./stream/playlist');
const createWatcher = require('./media/watcher');

function slugToName(slug) {
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

class Channel {
  constructor({ slug, name, mediaDir, dataDir, hlsDir }) {
    this.slug = slug;
    this.name = name !== null && name !== undefined ? name : (slug ? slugToName(slug) : null);
    this.mediaDir = mediaDir;
    this.libraryPath = path.join(dataDir, 'library.json');
    this.playlistPath = path.join(dataDir, 'playlist.ffconcat');
    this.hlsDir = hlsDir;
    this.library = createLibrary(this.libraryPath);
    this.engine = createEngine(slug || 'default', this.playlistPath, this.hlsDir);
    this._watcher = null;
  }

  async start() {
    await fs.mkdir(this.hlsDir, { recursive: true });
    await fs.mkdir(path.dirname(this.libraryPath), { recursive: true });
    await this.library.load();

    const entries = this.library.getReadyEntries();
    if (entries.length > 0) {
      await buildPlaylist(entries, this.playlistPath);
      this.engine.start();
    } else {
      console.log(`[channel:${this.slug || 'default'}] No media yet — drop files in ${this.mediaDir}`);
    }

    // Default channel (slug=null) watches only top-level files — subdirs are named channels.
    const watcherOpts = this.slug === null ? { depth: 0 } : {};
    this._watcher = createWatcher(this.mediaDir, this.library, () => this._update(), watcherOpts);
  }

  async _update() {
    const entries = this.library.getReadyEntries();
    if (entries.length === 0) {
      this.engine.stop();
      return;
    }
    await buildPlaylist(entries, this.playlistPath);
    if (!this.engine.isRunning()) this.engine.start();
    else this.engine.restart();
  }

  isRunning() {
    return this.engine.isRunning();
  }

  list() {
    return this.library.list();
  }

  stop() {
    this.engine.stop();
    if (this._watcher) this._watcher.close();
  }
}

module.exports = Channel;
