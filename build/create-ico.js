/**
 * Create ICO file from PNG for Windows
 */

const fs = require('fs');
const path = require('path');
const png2icons = require('png2icons');

const pngPath = path.join(__dirname, 'icon.png');
const pngBuffer = fs.readFileSync(pngPath);

// Convert PNG to ICO
const icoBuffer = png2icons.createICO(pngBuffer, png2icons.BICUBIC2, 0, true, true);

if (icoBuffer) {
  fs.writeFileSync(path.join(__dirname, 'icon.ico'), icoBuffer);
  console.log('Created icon.ico');
} else {
  console.error('Failed to create ICO');
}
