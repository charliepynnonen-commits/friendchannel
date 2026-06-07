const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs/promises');

async function normalize(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmpPath = path.join(dir, `.fc_tmp_${base}`);

  await new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-i', filePath,
      // Always fully transcode to 720p H264 25fps with clean timestamps.
      // Skipping video re-encode (copy) preserves original timestamps which
      // can cause the concat demuxer to miscalculate offsets and stall.
      '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black',
      '-r', '25',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
      '-g', '50', '-sc_threshold', '0',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2',
      '-movflags', '+faststart',
      '-y',
      tmpPath,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });

    let lastErr = '';
    proc.stderr.on('data', d => { lastErr = d.toString(); });
    proc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${lastErr.trim().slice(-120)}`));
    });
  });

  await fs.rename(tmpPath, filePath);
}

module.exports = { normalize };
