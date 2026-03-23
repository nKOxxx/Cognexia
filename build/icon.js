/**
 * Generate app icon for Cognexia Electron
 * Creates a simple 256x256 icon
 */

const fs = require('fs');
const path = require('path');

// Create a simple PNG icon using raw bytes
// This creates a basic 256x256 icon with "C" letter
function createIcon() {
  const size = 256;
  
  // PNG header and IHDR chunk
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  
  // Create IHDR chunk
  function createIHDR(width, height) {
    const data = Buffer.alloc(13);
    data.writeUInt32BE(width, 0);
    data.writeUInt32BE(height, 4);
    data.writeUInt8(8, 8);  // bit depth
    data.writeUInt8(6, 9);  // color type (RGBA)
    data.writeUInt8(0, 10); // compression
    data.writeUInt8(0, 11); // filter
    data.writeUInt8(0, 12); // interlace
    return createChunk('IHDR', data);
  }
  
  // Create chunk with CRC
  function createChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const typeBuffer = Buffer.from(type, 'ascii');
    const crcData = Buffer.concat([typeBuffer, data]);
    const crc = crc32(crcData);
    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE(crc >>> 0, 0);
    return Buffer.concat([length, typeBuffer, data, crcBuffer]);
  }
  
  // CRC32 calculation
  function crc32(buffer) {
    let crc = 0xffffffff;
    const table = makeCRCTable();
    for (let i = 0; i < buffer.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ buffer[i]) & 0xff];
    }
    return crc ^ 0xffffffff;
  }
  
  function makeCRCTable() {
    const table = new Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c;
    }
    return table;
  }
  
  // Create raw image data (RGBA)
  const rawData = Buffer.alloc(size * (1 + size * 4)); // +1 for filter byte per row
  
  // Colors (RGBA)
  const bgColor = [26, 26, 46, 255];      // #1a1a2e (dark blue)
  const circleColor = [94, 94, 128, 255]; // #5e5e80 (muted purple)
  const letterColor = [255, 255, 255, 255]; // White
  
  // Fill background
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    rawData[rowStart] = 0; // Filter: None
    
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 4;
      const cx = x - size / 2;
      const cy = y - size / 2;
      const dist = Math.sqrt(cx * cx + cy * cy);
      
      // Default: background
      let color = bgColor;
      
      // Circle
      if (dist < 100 && dist > 70) {
        color = circleColor;
      }
      
      // "C" letter (simplified)
      const angle = Math.atan2(cy, cx);
      const letterAngle = -Math.PI / 2;
      const angleDiff = Math.abs(normalizeAngle(angle - letterAngle));
      
      if (dist < 95 && dist > 55 && angleDiff < Math.PI / 2.5) {
        color = letterColor;
      }
      
      rawData[px] = color[0];
      rawData[px + 1] = color[1];
      rawData[px + 2] = color[2];
      rawData[px + 3] = color[3];
    }
  }
  
  function normalizeAngle(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }
  
  // Compress with zlib
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(rawData, { level: 9 });
  
  const ihdr = createIHDR(size, size);
  const idat = createChunk('IDAT', compressed);
  const iend = createChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdr, idat, iend]);
}

// Create icon
const iconBuffer = createIcon();
const buildDir = path.join(__dirname);

fs.writeFileSync(path.join(buildDir, 'icon.png'), iconBuffer);
console.log('Created icon.png');

module.exports = { createIcon };
