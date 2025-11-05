# ARES Console Quick Start Guide

Welcome to the ARES Console! This guide will help you get started with the knowledge graph building and exploration features.

---

## Table of Contents

1. [Navigation](#navigation)
2. [Keyboard Shortcuts](#keyboard-shortcuts)
3. [Theming (Sprint R9)](#theming)
4. [Progress & Gamification (Sprint R9)](#progress--gamification)
5. [Timeline Visualization (Sprint R9)](#timeline-visualization)
6. [Identity Review (Sprint R9)](#identity-review)
7. [Core Features](#core-features)

---

## Navigation

The ARES Console uses a top navigation bar with the following pages:

- **Home** - Welcome page and system status
- **Dashboard** - Overview of your knowledge graph
- **Notes** - Create and manage source notes
- **Entities** - Browse and manage extracted entities
- **Relations** - View and edit entity relationships
- **Graph** - Interactive graph visualization
- **Wiki** - Organized knowledge base view
- **Timeline** - ⭐ NEW: Temporal event visualization
- **Identity** - ⭐ NEW: Review and resolve duplicate entities
- **Snapshots** - Version control for your graph
- **Exports** - Export your data in various formats

---

## Keyboard Shortcuts

ARES Console uses Gmail-style keyboard navigation with the **g+key** pattern:

| Shortcut | Page |
|----------|------|
| `g` + `h` | Home |
| `g` + `d` | Dashboard |
| `g` + `n` | Notes |
| `g` + `e` | Entities |
| `g` + `r` | Relations |
| `g` + `g` | Graph |
| `g` + `w` | Wiki |
| `g` + `v` | Timeline (Vine) ⭐ NEW |
| `g` + `i` | Identity Review ⭐ NEW |
| `g` + `s` | Snapshots |
| `g` + `x` | Exports |
| `g` + `t` | Theme Editor ⭐ NEW |

**How to use**: Press `g`, then press the second key within 1 second. For example, to go to Entities, press `g` then `e`.

---

## Theming

### Overview
Customize the ARES Console appearance with themes. Change colors, backgrounds, and visual styles to suit your preferences.

### Opening the Theme Editor
- Click the 🎨 palette icon in the top-right header
- Or use keyboard shortcut: `g` + `t`

### Creating a Custom Theme

1. **Choose Colors**: Pick colors for primary, secondary, accent, and UI elements
2. **Select Background**:
   - **Solid Color**: Simple background color
   - **Gradient**: Linear or radial gradients
   - **Image URL**: Background image from a URL (with optional blur)
3. **Preview**: Click "Preview" to see changes before saving
4. **Save**: Give your theme a name and click "Save Theme"

### Managing Themes
- **Load Theme**: Click an existing theme to edit it
- **Delete Theme**: Select a theme and click "Delete" (cannot delete default)
- **Reset**: Click "Reset to Default" to restore the original theme

### Technical Details
- Themes are stored per-user in the database
- CSS variables (`--color-primary`, `--color-secondary`, etc.) are applied dynamically
- Theme preference persists across sessions

---

## Progress & Gamification

### Overview
Track your knowledge graph building progress, earn experience points (XP), and unlock new entity categories.

### Progress Bar
The progress bar appears in the bottom-right corner showing:
- Current level (in colored badge)
- XP progress bar to next level
- Click to expand for full details

### Expanded View
Click the progress bar to see:
- **Level**: Your current level
- **XP**: Experience points (current / needed for next level)
- **Entities**: Total entities created
- **Relations**: Total relations created
- **Unlocked Categories**: Entity categories you can now create

### How XP Works

**Earning XP**:
- Create an entity: **+10 XP**
- Create a relation: **+5 XP**
- Approve an entity: **varies**

**Level Calculation**:
```
level = floor(sqrt(entities/5 + relations/10))
```

**Next Level XP**:
```
XP needed = (level + 1)² × 50
```

### Category Unlocks
As you level up, new entity categories become available:

| Level | Category | Threshold |
|-------|----------|-----------|
| 0 | PERSON | 0 entities |
| 1-2 | PLACE | 10 entities |
| 2-3 | ORG | 20 entities |
| 3-4 | EVENT | 30 entities |
| 4-5 | CONCEPT | 50 entities |
| 5+ | THING | 75 entities |

**Unlock Animation**: When you unlock a new category, a celebration animation appears with the category name and particle effects!

---

## Timeline Visualization

### Overview
The Timeline page displays temporal events from your knowledge graph in an interactive force-directed layout.

### Accessing Timeline
- Navigate to Timeline tab
- Or use keyboard shortcut: `g` + `v`

### Features

#### Interactive Visualization
- **Events as Nodes**: Colored by category (PERSON, PLACE, ORG, EVENT, etc.)
- **Relations as Links**: Connections between events
- **Force-Directed Layout**: Events automatically organize based on relationships

#### Interactions
- **Drag**: Click and drag events to reposition them
- **Horizontal Drag**: Dragging events horizontally updates their date
- **Click**: Click an event to view details in the side drawer
- **Zoom**: Use mouse wheel to zoom in/out (0.1x - 4x)
- **Pan**: Click and drag on empty space to pan

#### Filtering
- **Date Range**: Set start and end dates to filter events
- **Confidence**: Adjust minimum confidence threshold (0-100%)
- **Reset Filters**: Click "Reset Filters" to clear all filters

#### Event Details Drawer
Click any event to see:
- Event label and description
- Date
- Category badge
- Confidence score
- Related seeds (source notes)

### Use Cases
- Explore chronological relationships
- Visualize event sequences
- Update event dates by dragging
- Identify temporal patterns
- Connect related events

---

## Identity Review

### Overview
Help ARES identify and resolve potential duplicate entities. Review similarity matches and decide whether entities should be merged or kept separate.

### Accessing Identity Review
- Navigate to Identity tab
- Or use keyboard shortcut: `g` + `i`

### How It Works

#### Candidate Detection
ARES analyzes your knowledge graph to find potential duplicates based on:
- Name similarity
- Category matching
- Shared relations
- Evidence patterns

#### Review Interface
Each candidate pair shows:
- **Similarity Score**: 0-100% match confidence
- **Entity Cards**: Side-by-side comparison with metadata
- **Evidence**: Reasons for the match suggestion
- **Shared Relations**: Number of common connections

#### Actions

**1. Same Entity (Merge)**
- Combines both entities into one
- Choose which entity to keep as primary
- All relations are merged
- Seeds from both are preserved

**2. Different (Separate)**
- Marks entities as distinct
- They won't be suggested as duplicates again
- Maintains separate entities

**3. Skip**
- Removes from current review list
- May appear again in future reviews
- No permanent changes

### Filtering
- **Min Similarity**: Adjust threshold (50% - 95%)
  - Higher = fewer but more confident matches
  - Lower = more candidates but less confident
- **Limit**: Maximum number of candidates to review

### Best Practices
- Start with high similarity (>85%) to catch obvious duplicates
- Review evidence carefully before merging
- Use "Skip" when unsure
- Lower similarity threshold gradually to find more subtle matches

### Example Scenarios

**Good Merge Candidates**:
- "Gandalf the Grey" ↔ "Gandalf" (same person, different names)
- "NYC" ↔ "New York City" (abbreviation vs full name)
- "Apple Inc." ↔ "Apple" (company name variations)

**Should Keep Separate**:
- "George Bush" (41st president) ↔ "George W. Bush" (43rd president)
- "Paris, France" ↔ "Paris, Texas" (different places)
- "The Office" (UK) ↔ "The Office" (US) (different shows)

---

## Core Features

### Notes
Create source notes that ARES will parse to extract entities and relations.

**Creating a Note**:
1. Navigate to Notes (`g` + `n`)
2. Click "New Note"
3. Enter your content
4. Click "Save"
5. ARES automatically extracts entities and relations

### Entities
Browse all extracted entities from your notes.

**Entity Card**:
- Name and category badge
- Confidence score
- Relation count
- Source seeds (notes)
- Inline editing

**Filters**:
- Filter by category
- Search by name
- Sort by confidence or relations

### Relations
View connections between entities.

**Relation Types**:
- Predefined types (based on your schema)
- Confidence scores
- Source evidence

### Graph
Interactive force-directed graph visualization of your entire knowledge base.

**Features**:
- Zoom and pan
- Filter by category
- Click nodes to see details
- Color-coded by entity category

### Wiki
Organized view of your knowledge in a wiki-style format.

**Features**:
- Hierarchical organization
- Category-based navigation
- Rich entity pages with relations

### Snapshots
Version control for your knowledge graph.

**Features**:
- Create snapshots at any time
- Restore previous versions
- Compare snapshots
- Git-style versioning

### Exports
Export your knowledge graph in various formats:
- JSON
- CSV
- GraphML
- Custom formats

---

## Tips & Tricks

### Productivity
- Use keyboard shortcuts for fast navigation
- Expand the progress bar to track your growth
- Review identity candidates regularly to maintain data quality
- Use timeline to explore temporal patterns

### Customization
- Create different themes for different moods or contexts
- Set a background image for inspiration
- Use color-coding to make entity categories stand out

### Data Quality
- Review low-confidence entities regularly
- Merge duplicates through Identity Review
- Check timeline dates for accuracy
- Use snapshots before major changes

---

## Getting Help

- **Inline Tooltips**: Hover over buttons and controls for hints
- **Keyboard Shortcut Reminders**: Shown in navigation tooltips
- **Theme Tips**: Info box in Theme Editor explains each option
- **Identity Review Guide**: Yellow info box at bottom of page

---

## What's New in Sprint R9

🎨 **Theming**: Fully customizable visual appearance
📊 **Progress System**: Levels, XP, and category unlocks
📅 **Timeline**: Interactive temporal event visualization
🤝 **Identity Review**: Duplicate detection and resolution

All features are fully integrated and accessible via keyboard shortcuts!

---

**Happy Knowledge Building! 🚀**
