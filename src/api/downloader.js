const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../config');

// Temp dir for yt-dlp intermediate files (f136, f140, .part, etc.).
// Lives outside data/media/ so the watcher never sees partial files —
// only the final merged MP4 moves into the watched directory.
const ytTmpDir = path.join(config.dataDir, '.yt_tmp');

function isInstalled() {
  try {
    execSync('yt-dlp --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function download(url, targetDir, onLine) {
  fs.mkdirSync(ytTmpDir, { recursive: true });
  fs.mkdirSync(targetDir, { recursive: true });

  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', [
      // Prefer H264 720p + M4A — matches our normalize fast-path so video copy is used.
      '--format', 'bestvideo[vcodec^=avc1][height<=720]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio[ext=m4a]/best[height<=720]/best',
      '--merge-output-format', 'mp4',
      // Final file lands in target dir; all intermediates (f136, f140, .part) stay in tmp
      '--paths', `home:${targetDir}`,
      '--paths', `temp:${ytTmpDir}`,
      '--output', '%(title)s.%(ext)s',
      '--restrict-filenames',
      '--no-playlist',
      '--newline',
      url,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let lastErr = '';

    const emit = (data) => {
      data.toString().split('\n').map(l => l.trim()).filter(Boolean).forEach(onLine);
    };

    proc.stdout.on('data', emit);
    proc.stderr.on('data', (d) => { lastErr = d.toString(); emit(d); });

    proc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(lastErr.trim().slice(-200) || `yt-dlp exited ${code}`));
    });
  });
}

module.exports = { download, isInstalled };
