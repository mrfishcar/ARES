# 🚀 ARES Desktop Launcher

A cute, one-click launcher for the ARES Knowledge Graph system!

## 🎯 Features

- ✨ **One-Click Launch**: Double-click to start all services
- 🔄 **Auto-Update**: Always uses the latest code from your git repository
- 🎨 **Pretty UI**: Colorful terminal output with ASCII art
- 🧠 **Smart Detection**: Checks which services are already running
- 📱 **Auto-Open Browser**: Launches directly to the Home page
- 💡 **Helpful Tips**: Shows keyboard shortcuts and quick links

## 📦 Installation

### Quick Setup (Recommended)

```bash
make launcher
```

This creates **ARES Launcher.app** on your Desktop!

### Manual Setup

```bash
./scripts/create-launcher.sh
```

## 🎮 Usage

### Double-Click Launch (easiest!)

1. Find **ARES Launcher.app** on your Desktop
2. Double-click it
3. Wait for all services to start
4. Browser opens automatically to the Home page!

### Command Line Launch

```bash
./launch-ares.command
```

## 🎨 Customize the Icon

Want a custom icon for the launcher?

1. Find or create a 512x512 PNG icon you like
2. Right-click **ARES Launcher.app** on your Desktop
3. Click **Get Info**
4. Drag your icon onto the small icon in the top-left corner
5. Close the Info window - done! 🎉

### Icon Ideas

- 🧠 Brain emoji (already used!)
- 🔮 Crystal ball
- 📚 Books
- 🗺️ Map
- 🌐 Globe
- 🔬 Microscope

## 🔧 How It Works

The launcher automatically:

1. **Checks if services are running** (ports 8000, 4000, 3001)
2. **Starts missing services** in separate Terminal tabs
3. **Shows service status** with color-coded output
4. **Opens your browser** to http://localhost:3001/home

Each service gets its own Terminal window with a descriptive title:
- **ARES Parser (port 8000)** - spaCy NLP service
- **ARES GraphQL (port 4000)** - API server
- **ARES Console UI (port 3001)** - React frontend

## 🔄 Auto-Update Feature

The launcher is **git-aware**! It always runs from:

```
/Users/corygilford/ares/
```

This means:
- ✅ `git pull` updates are used automatically
- ✅ Code changes apply immediately on next launch
- ✅ No need to reinstall the launcher after updates

## 🎯 What Opens

After launch, you'll see:

- **Console UI**: http://localhost:3001
- **Home Page**: http://localhost:3001/home (auto-opens)
- **GraphQL API**: http://localhost:4000
- **Metrics**: http://localhost:4100/metrics

## ⌨️ Keyboard Shortcuts

Once the app is running, press `g` + another key:

- `g h` → Home
- `g n` → Notes
- `g d` → Dashboard
- `g e` → Entities
- `g r` → Relations
- `g g` → Graph visualization
- `g w` → Wiki

## 🐛 Troubleshooting

### "Permission Denied" error

```bash
chmod +x launch-ares.command
chmod +x scripts/create-launcher.sh
```

### Services won't start

Make sure you've run:

```bash
make install
```

### Browser doesn't open

The launcher will show URLs - just copy and paste into your browser!

### "ARES Launcher can't be opened"

Right-click the app and select **Open**, then click **Open** in the dialog.
(This is a macOS security feature for unsigned apps)

## 🎨 Launcher Output Preview

```
    ___    ____  ___________
   /   |  / __ \/ ____/ ___/
  / /| | / /_/ / __/  \__ \
 / ___ |/ _, _/ /___ ___/ /
/_/  |_/_/ |_/_____//____/

Knowledge Graph System
Sprint R7: Prompt-First Home, Notes & Seeds

🔍 Checking services...

✓ Parser service is running
⚡ Starting GraphQL server...
⚡ Starting Console UI...

════════════════════════════════════════
✨ ARES is ready!
════════════════════════════════════════

📱 Console UI:    http://localhost:3001
🔧 GraphQL API:   http://localhost:4000
📊 Metrics:       http://localhost:4100/metrics
```

## 💡 Pro Tips

- **Keep the launcher terminal open** to see service status
- **Close the terminal** to see all running service tabs
- **Bookmark** http://localhost:3001 for quick access
- **Use keyboard shortcuts** (g+h, g+n, etc.) for fast navigation
- **Run `make launcher`** again to recreate if you move the ARES folder

## 🆘 Need Help?

Run `make help` to see all available commands!

---

Enjoy your one-click ARES experience! 🚀✨
