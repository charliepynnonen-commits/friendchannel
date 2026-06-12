const fs = require('fs/promises');

function escapeFile(p) {
  return p.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
}

async function build(entries, playlistPath, startPosition = 0) {
  const total = entries.reduce((sum, e) => sum + (e.duration || 0), 0);

  let rotateIdx = 0;
  let inpoint = 0;

  if (startPosition > 0 && total > 0) {
    let pos = startPosition % total;
    for (let i = 0; i < entries.length; i++) {
      const dur = entries[i].duration || 0;
      if (pos <= dur) {
        rotateIdx = i;
        inpoint = pos;
        break;
      }
      pos -= dur;
    }
  }

  const ordered = rotateIdx > 0
    ? [...entries.slice(rotateIdx), ...entries.slice(0, rotateIdx)]
    : entries;

  const lines = ['ffconcat version 1.0'];
  for (let i = 0; i < ordered.length; i++) {
    const { path: p, duration } = ordered[i];
    lines.push(`file '${escapeFile(p)}'`);
    if (i === 0 && inpoint > 0) {
      lines.push(`inpoint ${inpoint.toFixed(6)}`);
      // Explicit duration overrides any wrong metadata in the file header.
      // This prevents the concat demuxer from miscalculating timestamp offsets,
      // which is what caused the 45-second stall at file transitions.
      if (duration) lines.push(`duration ${(duration - inpoint).toFixed(6)}`);
    } else {
      if (duration) lines.push(`duration ${duration.toFixed(6)}`);
    }
  }

  await fs.writeFile(playlistPath, lines.join('\n') + '\n');
}

module.exports = { build };
