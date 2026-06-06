const { spawn, execSync } = require('child_process');
const config = require('../config');

function isInstalled() {
  try {
    execSync('yt-dlp --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function download(url, onLine) {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', [
      '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '--output', `${config.mediaDir}/%(title)s.%(ext)s`,
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
