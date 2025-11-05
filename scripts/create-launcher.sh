#!/bin/bash

# Creates a desktop launcher app for ARES

ARES_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="ARES Launcher.app"
DESKTOP="$HOME/Desktop"
APP_PATH="$DESKTOP/$APP_NAME"

echo "Creating ARES Desktop Launcher..."
echo "ARES Directory: $ARES_DIR"

# Remove old app if exists
if [ -d "$APP_PATH" ]; then
    echo "Removing old launcher..."
    rm -rf "$APP_PATH"
fi

# Create app bundle structure
mkdir -p "$APP_PATH/Contents/MacOS"
mkdir -p "$APP_PATH/Contents/Resources"

# Create Info.plist
cat > "$APP_PATH/Contents/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>launcher</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundleIdentifier</key>
    <string>com.ares.launcher</string>
    <key>CFBundleName</key>
    <string>ARES</string>
    <key>CFBundleDisplayName</key>
    <string>ARES Knowledge Graph</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.13</string>
</dict>
</plist>
EOF

# Create the launcher script
cat > "$APP_PATH/Contents/MacOS/launcher" << 'EOF'
#!/bin/bash

# Get the ARES directory from the symlink we'll create
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ARES_DIR="$(cat "$SCRIPT_DIR/ares_path.txt")"

cd "$ARES_DIR"

# Run the launch script
exec "$ARES_DIR/launch-ares.command"
EOF

# Store the ARES path
echo "$ARES_DIR" > "$APP_PATH/Contents/MacOS/ares_path.txt"

# Make launcher executable
chmod +x "$APP_PATH/Contents/MacOS/launcher"

# Create a simple icon using emoji (requires macOS 10.14+)
# This creates a temporary PNG icon
cat > /tmp/ares-icon.html << EOF
<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            margin: 0;
            padding: 0;
            width: 512px;
            height: 512px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .icon {
            text-align: center;
            color: white;
        }
        .emoji {
            font-size: 280px;
            line-height: 1;
            display: block;
        }
        .text {
            font-size: 48px;
            font-weight: 700;
            margin-top: -20px;
            letter-spacing: 8px;
        }
    </style>
</head>
<body>
    <div class="icon">
        <span class="emoji">🧠</span>
        <div class="text">ARES</div>
    </div>
</body>
</html>
EOF

echo ""
echo "✨ Desktop launcher created!"
echo ""
echo "📍 Location: $APP_PATH"
echo ""
echo "🎨 To customize the icon:"
echo "   1. Right-click 'ARES Launcher.app' on your Desktop"
echo "   2. Select 'Get Info'"
echo "   3. Drag an icon image onto the small icon in the top-left"
echo ""
echo "🚀 Double-click the app to launch ARES!"
echo ""
echo "💡 The launcher will always use the latest code from:"
echo "   $ARES_DIR"
echo ""
