const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs/promises');
const { probe } = require('../stream/probe');

async function normalize(filePath) {
  const info = await probe(filePath);

  // Skip video re-encode if already H264 at ≤720p 25fps.
  // This makes normalize near-instant on a Pi for YouTube 720p downloads.
  // Any other format gets a full transcode to ensure consistent output.
  const copyVideo = info.isH264 && info.height <= 720 && Math.round(info.fps) === 25;

  if (copyVideo) {
    console.log(`[normalize] ${path.basename(filePath)} — H264 720p 25fps, copying video`);
  } else {
    console.log(`[normalize] ${path.basename(filePath)} — transcoding (${info.codec} ${info.height}p ${info.fps}fps)`);
  }

  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmpPath = path.join(dir, `.fc_tmp_${base}`);

  const videoArgs = copyVideo
    ? ['-c:v', 'copy']
    : [
        '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black',
        '-r', '25',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
        '-g', '50', '-sc_threshold', '0',
      ];

  await new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-i', filePath,
      ...videoArgs,
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
