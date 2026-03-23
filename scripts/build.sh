#!/bin/bash
# Cognexia Electron Build Script

set -e

echo "=== Cognexia Electron Build ==="
echo ""

# Check for required tools
command -v npm >/dev/null 2>&1 || { echo "npm is required but not installed." >&2; exit 1; }

# Install dependencies
echo "Installing dependencies..."
npm install

# Generate icons if needed
if [ ! -f "build/icon.icns" ] || [ ! -f "build/icon.ico" ]; then
    echo "Generating icons..."
    node build/icon.js
    node build/convert-icons.js
    node build/create-ico.js
fi

# Build for current platform
PLATFORM=$(uname -s)
case "$PLATFORM" in
    Darwin*)
        echo "Building for macOS..."
        npm run build:electron:mac
        ;;
    Linux*)
        echo "Building for Linux..."
        npm run build:electron:linux
        ;;
    MINGW*|CYGWIN*|MSYS*)
        echo "Building for Windows..."
        npm run build:electron:win
        ;;
    *)
        echo "Unknown platform: $PLATFORM"
        echo "Building for current platform..."
        npm run build:electron
        ;;
esac

echo ""
echo "=== Build Complete ==="
echo "Output directory: dist/"
ls -la dist/ 2>/dev/null || echo "No dist directory found"
