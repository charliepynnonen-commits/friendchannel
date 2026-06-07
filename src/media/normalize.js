const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');

const VAAPI_DEVICE = '/dev/dri/renderD128';

function useVaapi() {
  return process.platform === 'linux' && fsSync.existsSync(VAAPI_DEVICE);
}

async function normalize(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmpPath = path.join(dir, `.fc_tmp_${base}`);
  const vaapi = useVaapi();

  console.log(`[normalize] ${path.basename(filePath)} — ${vaapi ? 'VAAPI hardware' : 'libx264 software'} encode`);

  const args = vaapi ? [
    '-vaapi_device', VAAPI_DEVICE,
    '-i', filePath,
    // Scale/pad on CPU, convert to NV12, upload to GPU for encoding
    '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,format=nv12,hwupload',
    '-r', '25',
    '-c:v', 'h264_vaapi', '-qp', '23', '-g', '50',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2',
    '-movflags', '+faststart',
    '-y', tmpPath,
  ] : [
    '-i', filePath,
    '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black',
    '-r', '25',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
    '-g', '50', '-sc_threshold', '0',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2',
    '-movflags', '+faststart',
    '-y', tmpPath,
  ];

  const run = (a) => new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', a, { stdio: ['ignore', 'ignore', 'pipe'] });
    let lastErr = '';
    proc.stderr.on('data', d => { lastErr = d.toString(); });
    proc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${lastErr.trim().slice(-120)}`));
    });
  });

  try {
    await run(args);
  } catch (err) {
    if (vaapi) {
      console.warn(`[normalize] VAAPI failed (${err.message.slice(0, 60)}), retrying with libx264`);
      const softArgs = [
        '-i', filePath,
        '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black',
        '-r', '25',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
        '-g', '50', '-sc_threshold', '0',
        '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2',
        '-movflags', '+faststart',
        '-y', tmpPath,
      ];
      await run(softArgs);
    } else {
      throw err;
    }
  }

  await fs.rename(tmpPath, filePath);
}

module.exports = { normalize };
