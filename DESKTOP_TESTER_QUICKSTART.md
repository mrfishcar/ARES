# 🏺 Ares Desktop Tester - Quick Start

A simple desktop application for testing wiki generation. Just paste text and generate wikis!

## ⚡ Quick Start (30 seconds)

### Option 1: Use the Launcher Script

```bash
cd /Users/corygilford/ares/app/desktop-tester
./start-tester.sh
```

Then open **http://localhost:3000** in your browser.

### Option 2: Manual Start

```bash
cd /Users/corygilford/ares/app/desktop-tester
npm start
```

Then open **http://localhost:3000** in your browser.

## 📝 How to Use

1. **Start the server** (see above)
2. **Open** http://localhost:3000 in your browser
3. **Paste text** into the text box (or use the example)
4. **Click "Generate Wikis"**
5. **Check your Desktop** for the `test_wikis` folder

## 📂 Where are the wikis?

All generated wikis are saved to:

```
~/Desktop/test_wikis/
```

Each time you generate wikis, a new timestamped folder is created with:
- Individual `.md` files for each entity
- An `index.md` file with statistics and links to all pages

## 🎯 Example Text to Try

Paste this into the text box:

```
Aragorn, son of Arathorn, was born in 2931 of the Third Age.
Aragorn married Arwen in 3019.
Aragorn became King of Gondor and ruled from Minas Tirith.
Aragorn was friends with Gandalf the wizard.
Gandalf traveled to Rivendell in 3018 and later to Minas Tirith in 3019.
Gandalf authored several books on magic.
Arwen, daughter of Elrond, lived in Rivendell before 3019.
```

This will generate wiki pages for Aragorn, Gandalf, Arwen, and related entities.

## 🛑 How to Stop

Press `Ctrl+C` in the terminal where the server is running.

## 🎨 Features

- **Beautiful UI** - Clean, modern interface
- **Real-time Processing** - See progress as it happens
- **Statistics** - View entity/relation counts
- **Batch Organization** - Each run in its own folder
- **Index Files** - Easy navigation of all generated wikis

## 🔧 Troubleshooting

### "Cannot connect to server"
→ Make sure you've started the server with `npm start` or `./start-tester.sh`

### "Port 3000 already in use"
→ Stop any other servers running on port 3000, or edit `server.ts` to use a different port

### No wikis on Desktop
→ Check the terminal output for the exact path. The folder is created automatically.

## 📚 Full Documentation

See `app/desktop-tester/README.md` for complete documentation.

---

**Built for personal testing of the Ares knowledge graph system**
