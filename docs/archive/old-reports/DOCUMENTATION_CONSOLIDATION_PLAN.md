# Documentation Consolidation Plan

**Current Status**: 📚 **DOCUMENTATION CHAOS** - 54 markdown files in repo root!

---

## 🚨 The Problem

**Main branch has:**
- 54 markdown files cluttering the root directory
- Multiple duplicate handoff docs (HANDOFF.md, HANDOFF_TO_CHATGPT.md)
- Tons of old phase/sprint completion reports (PHASE1, PHASE2, SPRINT_R1, etc.)
- Multiple "COMPLETE" reports for same features
- Hard to find current documentation
- New users overwhelmed

**Consolidate-docs branch has:**
- Clean, professional README.md
- Single CHANGELOG.md tracking all changes
- Only 2 files in root
- Easy to navigate

---

## ✅ Consolidation Strategy

### Keep in Root (User-Facing)

**From consolidate-docs branch** (better versions):
1. ✅ **README.md** - Clean, professional project overview
2. ✅ **CHANGELOG.md** - All changes tracked chronologically

**From main branch** (current work):
3. ✅ **ENTITY_EXTRACTION_STATUS.md** - My comprehensive entity extraction docs
4. ✅ **HANDOFF.md** - Session handoff for next Claude

### Create docs/ Folder Structure

```
docs/
├── architecture/
│   ├── HERT_SPECIFICATION.md
│   ├── ENGINE_DESIGN.md
│   └── EXTRACTION_PIPELINE.md
│
├── guides/
│   ├── GETTING_STARTED.md
│   ├── DEVELOPER_GUIDE.md
│   └── DESKTOP_TESTER_QUICKSTART.md
│
├── reference/
│   ├── API_REFERENCE.md
│   └── WIKI_QUICKSTART.md
│
└── archive/
    └── old-reports/
        ├── PHASE1_COMPLETE.md
        ├── PHASE2_COMPLETE.md
        └── [all 40+ old reports]
```

### Delete/Archive (Outdated)

Move to `docs/archive/old-reports/`:
- All PHASE*.md files (11 files)
- All SPRINT*.md files (8 files)
- All *_COMPLETE.md files (15 files)
- Duplicate handoffs (HANDOFF_TO_CHATGPT.md)
- Old progress reports (20+ files)

**Total to archive**: ~45 files

---

## 📋 Final Root Directory

```
ARES/
├── README.md                          ← From consolidate-docs
├── CHANGELOG.md                       ← From consolidate-docs
├── ENTITY_EXTRACTION_STATUS.md        ← Current work (mine)
├── HANDOFF.md                         ← Current session handoff
├── LICENSE
├── package.json
├── vercel.json
├── docs/                              ← New organized structure
├── app/
├── tests/
└── data/
```

**Result**: 4 markdown files in root (from 54!)

---

## 🎯 Execution Plan

### Step 1: Create docs/ Structure

```bash
mkdir -p docs/architecture
mkdir -p docs/guides
mkdir -p docs/reference
mkdir -p docs/archive/old-reports
```

### Step 2: Move Important Docs to docs/

**Architecture**:
- HERT_INTEGRATION_GUIDE.md → docs/architecture/
- ENGINE_EVOLUTION_STRATEGY.md → docs/architecture/

**Guides**:
- DESKTOP_TESTER_QUICKSTART.md → docs/guides/
- QUICK_START.md → docs/guides/

**Reference**:
- WIKI_QUICKSTART.md → docs/reference/

### Step 3: Archive Old Reports

```bash
# Move all phase/sprint/complete reports
mv PHASE*.md docs/archive/old-reports/
mv SPRINT*.md docs/archive/old-reports/
mv *_COMPLETE*.md docs/archive/old-reports/
mv HANDOFF_TO_CHATGPT.md docs/archive/old-reports/
```

### Step 4: Update Root with Clean Docs

```bash
# Copy clean README and CHANGELOG from consolidate-docs branch
git show origin/claude/consolidate-ares-docs-011CUqnJMA4KoBQkCUw7yMwK:README.md > README.md
git show origin/claude/consolidate-ares-docs-011CUqnJMA4KoBQkCUw7yMwK:CHANGELOG.md > CHANGELOG.md
```

### Step 5: Update README.md

Add section about Entity Extraction Lab:

```markdown
## Features

- **Entity Extraction** - Identifies people, places, organizations, dates, and more
- **Extraction Lab** - Browser-based testing interface for real-time entity detection
- **Relation Extraction** - Finds connections (parent_of, works_at, married_to, etc.)
...
```

Add link to entity extraction docs:
```markdown
## Documentation

- **[Entity Extraction Status](ENTITY_EXTRACTION_STATUS.md)** - Current entity detection system
- **[Getting Started](docs/guides/GETTING_STARTED.md)** - Installation and setup
...
```

### Step 6: Update CHANGELOG.md

Add entry for my entity extraction work:

```markdown
## 2025-11-06 - Claude Code (Sonnet 4.5)

### Added
- **Extraction Lab** - Browser-based entity testing interface
  - Real-time entity highlighting with CodeMirror
  - 20+ detection patterns for dialogue, titles, objects
  - Client-side entity deduplication
  - JSON report export for analysis
- **Comprehensive filters**:
  - Time words (days/months)
  - Abbreviations (Ch, Vol, Pg)
  - Common adjectives (Scotch tape, French fries)
  - Context word stripping (Yet, His, The)
- **Vercel deployment** configuration for browser testing

### Changed
- Enhanced entity detection with dialogue attribution
- Improved multi-word name detection
- Added newline normalization for entity text

### Fixed
- Scrolling issue in Extraction Lab editor
- Chapter title false positives
- Recurring character under-detection

### Documentation
- Created ENTITY_EXTRACTION_STATUS.md (744 lines)
- Created HANDOFF.md for session continuity
- Documented macro-level vision for book-scale analysis

### Notes
- System uses regex patterns (micro-level)
- Future: Implement syntactic parsing + discourse analysis (macro-level)
- Vision: 5-level architecture (token → sentence → paragraph → chapter → book)
- User is a literary critic, wants book-scale entity tracking
```

---

## 🤔 What to Keep

### Essential Current Work
1. ✅ **ENTITY_EXTRACTION_STATUS.md** - My comprehensive entity extraction documentation
2. ✅ **HANDOFF.md** - Session handoff for continuity
3. ✅ **README.md** (from consolidate-docs) - Clean project overview
4. ✅ **CHANGELOG.md** (from consolidate-docs) - Change history

### Important Technical Docs (Move to docs/)
1. HERT_INTEGRATION_GUIDE.md → Architecture docs
2. ENGINE_EVOLUTION_STRATEGY.md → Architecture docs
3. DESKTOP_TESTER_QUICKSTART.md → Guide
4. WIKI_QUICKSTART.md → Reference

### Everything Else
- Archive old phase/sprint reports (historical value, not current)
- Delete truly obsolete docs
- Keep CHANGELOG as single source of truth for history

---

## 💡 Benefits

**Before** ❌:
- 54 files in root
- Impossible to find current docs
- New users overwhelmed
- Duplicate information
- Outdated reports cluttering

**After** ✅:
- 4 files in root
- Clear navigation
- Professional appearance
- Easy to find current status
- Organized docs/ folder
- Historical context preserved in archive

---

## 🚀 Next Steps

### Option A: Automated Cleanup (Recommended)
I can execute this plan automatically:
1. Create docs/ structure
2. Move files to appropriate locations
3. Update README and CHANGELOG
4. Archive old reports
5. Commit everything

**Time**: ~5 minutes
**Risk**: Low (everything archived, nothing deleted)

### Option B: Manual Review
You review the 54 files and tell me which to keep/move/archive

**Time**: ~30 minutes
**Risk**: None (you decide everything)

### Option C: Hybrid
I create the plan, you approve, I execute

**Time**: ~10 minutes
**Risk**: Low (you approve before execution)

---

## 🎯 My Recommendation

**Option A: Let me clean it up automatically**

Reasons:
1. I understand the codebase and documentation
2. Nothing gets deleted (all archived)
3. You can review the changes before pushing
4. Clean structure helps future Claude sessions
5. Takes 5 minutes vs 30+ minutes manual

**Want me to proceed?** Just say "yes, clean it up" and I'll execute the plan! 🧹
