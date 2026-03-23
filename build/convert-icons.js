/**
 * Convert PNG to ICNS for macOS
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pngPath = path.join(__dirname, 'icon.png');
const buildDir = path.join(__dirname);
const sizes = [16, 32, 64, 128, 256, 512];

// Create temp directory for iconset
const iconsetDir = path.join(buildDir, 'icon.iconset');
if (!fs.existsSync(iconsetDir)) {
  fs.mkdirSync(iconsetDir);
}

// Generate different sizes
sizes.forEach(size => {
  const outPath = path.join(iconsetDir, `icon_${size}x${size}.png`);
  try {
    execSync(`sips -z ${size} ${size} "${pngPath}" --out "${outPath}"`);
    console.log(`Created ${size}x${size}`);
  } catch (e) {
    console.error(`Failed to create ${size}x${size}: ${e.message}`);
  }
  
  // 2x versions for Retina
  if (size <= 256) {
    const retinaPath = path.join(iconsetDir, `icon_${size}x${size}@2x.png`);
    try {
      execSync(`sips -z ${size * 2} ${size * 2} "${pngPath}" --out "${retinaPath}"`);
      console.log(`Created ${size * 2}x${size * 2} @2x`);
    } catch (e) {}
  }
});

// Convert to ICNS
try {
  execSync(`iconutil -c icns "${iconsetDir}"`, { stdio: 'inherit' });
  console.log('Created icon.icns');
} catch (e) {
  console.error('Failed to create ICNS:', e.message);
}

// For Windows, try to create ICO using sips (macOS workaround)
// Just copy PNG as placeholder - electron-builder will handle conversion
fs.copyFileSync(pngPath, path.join(buildDir, 'icon_256.png'));
console.log('Created icon_256.png (for reference)');
