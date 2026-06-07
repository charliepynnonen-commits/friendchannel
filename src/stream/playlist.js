const fs = require('fs/promises');
const config = require('../config');

async function build(entries) {
  const lines = ['ffconcat version 1.0'];
  for (const { path: p, duration } of entries) {
    lines.push(`file '${p.replace(/\\/g, '\\\\').replace(/'/g, "'\\''")}'`);
    // Explicit duration overrides any wrong metadata in the file header.
    // This prevents the concat demuxer from miscalculating timestamp offsets,
    // which is what caused the 45-second stall at file transitions.
    if (duration) lines.push(`duration ${duration.toFixed(6)}`);
  }
  await fs.writeFile(config.playlistPath, lines.join('\n') + '\n');
}

module.exports = { build };
