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
  constructor({ slug, name, mediaDir, dataDir, hlsDir, iconDir }) {
    this.slug = slug;
    this.name = name !== null && name !== undefined ? name : (slug ? slugToName(slug) : null);
    this.mediaDir = mediaDir;
    this.iconDir = iconDir || null;
    this.libraryPath = path.join(dataDir, 'library.json');
    this.playlistPath = path.join(dataDir, 'playlist.ffconcat');
    this.statePath = path.join(dataDir, 'state.json');
    this.hlsDir = hlsDir;
    this.library = createLibrary(this.libraryPath);
    this.engine = createEngine(slug || 'default', this.playlistPath, this.hlsDir, this.iconDir);
    this._watcher = null;
    this._snoozeTimer = null;
  }

  async start() {
    await fs.mkdir(this.hlsDir, { recursive: true });
    await fs.mkdir(path.dirname(this.libraryPath), { recursive: true });
    await this.library.load();

    const originTime = await this._ensureOriginTime();
    const entries = this.library.getReadyEntries();
    if (entries.length > 0) {
      await buildPlaylist(entries, this.playlistPath, this._position(originTime));
      this.engine.start();
    } else {
      console.log(`[channel:${this.slug || 'default'}] No media yet — drop files in ${this.mediaDir}`);
    }

    // Default channel (slug=null) watches only top-level files — subdirs are named channels.
    const watcherOpts = this.slug === null ? { depth: 0 } : {};
    this._watcher = createWatcher(this.mediaDir, this.library, () => this._update(), watcherOpts);

    // Check every minute if any snoozed video's timer has expired.
    this._snoozeTimer = setInterval(() => this._checkSnoozeExpiry(), 60_000);
  }

  // Saves originTime on first start; reads it on every subsequent start.
  // This fixed clock is used to calculate position in the virtual timeline.
  async _ensureOriginTime() {
    try {
      const state = JSON.parse(await fs.readFile(this.statePath, 'utf8'));
      if (state.originTime) return state.originTime;
    } catch {}
    const originTime = Date.now();
    await fs.writeFile(this.statePath, JSON.stringify({ originTime }));
    return originTime;
  }

  async _getOriginTime() {
    try {
      return JSON.parse(await fs.readFile(this.statePath, 'utf8')).originTime || null;
    } catch { return null; }
  }

  // How far (in seconds) into the virtual playlist timeline we currently are.
  _position(originTime) {
    return originTime ? (Date.now() - originTime) / 1000 : 0;
  }

  async _update() {
    const originTime = await this._getOriginTime();
    const entries = this.library.getReadyEntries();
    if (entries.length === 0) {
      this.engine.stop();
      return;
    }
    await buildPlaylist(entries, this.playlistPath, this._position(originTime));
    if (!this.engine.isRunning()) this.engine.start();
    else this.engine.restart();
  }

  async _checkSnoozeExpiry() {
    const now = Date.now();
    // Rebuild only when a snooze timer crossed zero during the last interval.
    const justExpired = this.library.list().some(
      f => f.status === 'ready' && f.snoozedUntil && f.snoozedUntil <= now && f.snoozedUntil > now - 70_000
    );
    if (justExpired) await this._update();
  }

  async snooze(id, hours) {
    const ok = await this.library.snooze(id, hours * 3_600_000);
    if (ok) await this._update();
    return ok;
  }

  async unsnooze(id) {
    const ok = await this.library.unsnooze(id);
    if (ok) await this._update();
    return ok;
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
    if (this._snoozeTimer) { clearInterval(this._snoozeTimer); this._snoozeTimer = null; }
  }
}

module.exports = Channel;
