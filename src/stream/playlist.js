const fs = require('fs/promises');
const config = require('../config');

async function build(filePaths) {
  const lines = ['ffconcat version 1.0'];
  for (const p of filePaths) {
    // Escape single quotes in paths
    lines.push(`file '${p.replace(/\\/g, '\\\\').replace(/'/g, "'\\''")}'`);
  }
  await fs.writeFile(config.playlistPath, lines.join('\n') + '\n');
}

module.exports = { build };
