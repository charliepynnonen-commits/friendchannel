const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

async function probe(filePath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_streams',
    '-show_format',
    filePath,
  ]);
  const info = JSON.parse(stdout);
  const videoStream = info.streams?.find(s => s.codec_type === 'video');
  const audioStream = info.streams?.find(s => s.codec_type === 'audio');
  const [fpsNum, fpsDen] = (videoStream?.r_frame_rate || '25/1').split('/').map(Number);
  const fps = fpsDen ? Math.round((fpsNum / fpsDen) * 100) / 100 : 25;

  return {
    duration: parseFloat(info.format?.duration || 0),
    codec: videoStream?.codec_name || 'unknown',
    width: videoStream?.width || null,
    height: videoStream?.height || null,
    fps,
    isH264: videoStream?.codec_name === 'h264',
    hasAudio: !!audioStream,
  };
}

module.exports = { probe };
