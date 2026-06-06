const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs/promises');
const config = require('../config');

async function build(files) {
  if (files.length === 0) return false;

  const tmpPlaylist = path.join(config.dataDir, '.fc_prerender.txt');
  const content = 'ffconcat version 1.0\n'
    + files.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n')
    + '\n';
  await fs.writeFile(tmpPlaylist, content);

  const tmpLoop = path.join(config.dataDir, '.fc_loop_tmp.mp4');

  console.log(`[prerender] Building loop.mp4 from ${files.length} file(s)...`);
  const start = Date.now();

  await new Promise((resolve, reject) => {
    let lastErr = '';
    const proc = spawn('ffmpeg', [
      '-f', 'concat', '-safe', '0', '-i', tmpPlaylist,
      // All files are already normalized to 720p H264 + AAC — just copy them together.
      // This is fast (no re-encoding) and produces clean timestamps with no discontinuities.
      '-c', 'copy',
      '-movflags', '+faststart',
      '-y', tmpLoop,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });

    proc.stderr.on('data', d => { lastErr = d.toString(); });
    proc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`prerender failed (code ${code}): ${lastErr.trim().slice(-200)}`));
    });
  });

  await fs.rename(tmpLoop, config.loopPath);
  await fs.unlink(tmpPlaylist).catch(() => {});

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[prerender] loop.mp4 ready (${elapsed}s)`);
  return true;
}

module.exports = { build };
