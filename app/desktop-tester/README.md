# Ares Desktop Tester

Simple desktop application for testing Ares wiki generation.

## Features

- ✨ Beautiful, user-friendly interface
- 📝 Simple text input and "Generate" button
- 🚀 Real-time processing and statistics
- 📊 Automatic wiki generation from any text
- 💾 Saves markdown files to `~/Desktop/test_wikis/`
- 🎯 Perfect for quick testing and experimentation

## Quick Start

### 1. Install Dependencies

```bash
cd app/desktop-tester
npm install
```

### 2. Start the Server

```bash
npm start
```

This will:
- Start the backend server on `http://localhost:3000`
- Create the `test_wikis` folder on your Desktop (if it doesn't exist)
- Display the URL to open in your browser

### 3. Open in Browser

Open your web browser and navigate to:

```
http://localhost:3000
```

### 4. Generate Wikis

1. Paste any text into the text box
2. Click "Generate Wikis" button
3. Wait for processing (usually a few seconds)
4. Check your Desktop for the `test_wikis` folder
5. Each run creates a timestamped batch folder with:
   - Individual `.md` files for each entity
   - An `index.md` file with statistics and links

## Example Input

Try pasting this example text:

```
Aragorn, son of Arathorn, was born in 2931 of the Third Age.
Aragorn married Arwen in 3019.
Aragorn became King of Gondor and ruled from Minas Tirith.
Aragorn was friends with Gandalf the wizard.
Gandalf traveled to Rivendell and later to Minas Tirith.
```

## Output Structure

```
~/Desktop/test_wikis/
  └── batch_1234567890/
      ├── index.md              # Index with links to all pages
      ├── aragorn.md            # Individual wiki page
      ├── arwen.md
      ├── gandalf.md
      └── ...
```

## Features in Action

### Overview Generation
- 2-3 sentence summaries with highest-salience facts
- Prioritizes marriages, rules, battles, authorship

### Infobox
- Deterministic field ordering
- Deduplication of relationships
- Alphabetically sorted multi-value fields

### Biography
- Timeline-based chronological narrative
- Suppresses facts already in Overview
- 4-10 dated sentences

### Relationships Section
- Suppresses duplicates from Overview and Biography
- Organized by predicate type
- Clear, readable format

## Keyboard Shortcuts

- `Cmd+Enter` (Mac) or `Ctrl+Enter` (Windows/Linux): Generate wikis

## Troubleshooting

### Server won't start

- Make sure port 3000 is not in use
- Check that you're in the correct directory
- Ensure dependencies are installed (`npm install`)

### "Backend server is not running" error

- Make sure you've started the server with `npm start`
- Check the terminal for any error messages
- Verify the server is running on port 3000

### Wikis not appearing on Desktop

- Check the terminal output for the exact path
- Make sure you have write permissions to your Desktop
- Look for a `test_wikis` folder (it's created automatically)

## Development

### Auto-reload on changes

```bash
npm run dev
```

This uses `nodemon` to automatically restart the server when you make changes.

### Project Structure

```
app/desktop-tester/
  ├── index.html          # Frontend UI
  ├── server.ts           # Backend Express server
  ├── package.json        # Dependencies
  └── README.md           # This file
```

## Technical Details

- **Frontend:** Pure HTML/CSS/JavaScript (no build step required)
- **Backend:** Express.js + TypeScript
- **Processing:** Uses Ares extraction, merge, and composition pipelines
- **Storage:** Temporary JSON files (auto-cleaned after each run)
- **Output:** Standard Markdown format compatible with any viewer

## Tips

1. **Test with different text types:**
   - Biographical narratives
   - Historical events
   - Story excerpts
   - News articles

2. **Experiment with dates:**
   - Dated facts are prioritized in Overview
   - Timeline generation works best with years

3. **Check the index.md file first:**
   - See overall statistics
   - Browse all generated entities
   - Entity type breakdown

4. **Batched organization:**
   - Each run creates a new timestamped folder
   - Previous runs are preserved
   - Easy to compare different text inputs

## Limitations

- Designed for personal testing only
- No authentication or security features
- Single-user at a time
- Text size limited to 50MB per request
- No persistence between runs

## Future Enhancements

Possible improvements:
- File upload support
- Batch processing multiple documents
- Export options (PDF, HTML)
- Comparison view between runs
- Search within generated wikis

---

Built with ❤️ for testing Ares knowledge graph extraction
