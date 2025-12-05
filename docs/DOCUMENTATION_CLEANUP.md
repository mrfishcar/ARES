# Documentation Cleanup Recommendations

**Date:** 2025-12-05
**Purpose:** Reduce token waste and documentation redundancy

---

## Current Documentation Assessment

### Essential Documents (KEEP)

| Document | Tokens (~) | Purpose | Action |
|----------|------------|---------|--------|
| README.md | ~600 | Single source of truth | Keep as-is |
| HANDOFF.md | ~800 | Active session state | Keep lean |
| CLAUDE.md | ~1500 | AI assistant guide | Slim to ~800 |
| docs/VISION.md | ~1000 | Product vision | Keep |
| docs/FOR_AGENTS.md | ~700 | AI onboarding | Keep |
| docs/AI_MODEL_GUIDE.md | ~600 | **NEW** Model selection | Keep |
| docs/LINGUISTIC_REFERENCE.md | ~2000 | Linguistic patterns | Keep (essential) |

### Documents to Archive

These documents contain redundant or outdated information:

| Document | Issue | Action |
|----------|-------|--------|
| docs/ares-vision-comprehensive-knowledge-extraction.md | Overlaps with VISION.md | Archive |
| docs/STATUS.md | Status should be in README/HANDOFF | Archive |
| docs/CODEX_FRESH_START.md | Outdated agent instructions | Archive |
| docs/CODEX_HANDOFF_BRIEFING.md | Outdated handoff | Archive |
| docs/CODEX_QUICK_HANDOFF.md | Outdated handoff | Archive |
| docs/SESSION_SUMMARY.md | Should merge into HANDOFF | Archive |
| INTEGRATED_TESTING_STRATEGY.md | Outdated status, verbose | Slim/Archive |

### Documents in docs/archive/ (Already Archived)
- All files in docs/archive/ are already archived - good

---

## Token Efficiency Improvements

### 1. CLAUDE.md Slimming Plan

Current: ~1500 tokens
Target: ~800 tokens

**Remove:**
- Redundant examples (covered in LINGUISTIC_REFERENCE.md)
- Verbose "Common Tasks" section (can reference CONTRIBUTING.md)
- Historical iteration details (keep only current status)

**Keep:**
- Model Selection (NEW, critical)
- Quick Start
- Architecture overview
- Key Conventions
- Critical Reminders

### 2. Single Status Location

**Problem:** Status info scattered across:
- README.md (Status snapshot)
- HANDOFF.md (Running Log)
- CLAUDE.md (Current Status)
- INTEGRATED_TESTING_STRATEGY.md (Current Status Summary)

**Solution:**
- README.md: Brief current status only
- HANDOFF.md: Active task status only
- All others: Reference README.md

### 3. Consolidate Vision Documents

**Problem:** Multiple vision documents:
- docs/VISION.md (primary)
- docs/ares-vision-comprehensive-knowledge-extraction.md (redundant)

**Solution:**
- Keep docs/VISION.md
- Archive ares-vision-comprehensive (move to docs/archive/)

---

## Recommended Cleanup Commands

```bash
# Archive redundant vision doc
mv docs/ares-vision-comprehensive-knowledge-extraction.md docs/archive/

# Archive outdated handoff docs
mv docs/CODEX_FRESH_START.md docs/archive/
mv docs/CODEX_HANDOFF_BRIEFING.md docs/archive/
mv docs/CODEX_QUICK_HANDOFF.md docs/archive/

# Archive STATUS.md (redundant with README)
mv docs/STATUS.md docs/archive/

# Archive SESSION_SUMMARY (merge into HANDOFF)
mv docs/SESSION_SUMMARY.md docs/archive/
```

---

## Documentation Hierarchy

```
TIER 1 - ALWAYS LOAD (essential context):
├── README.md          # What is ARES, current status
├── HANDOFF.md         # Active task, last session
└── docs/AI_MODEL_GUIDE.md  # Model selection

TIER 2 - LOAD AS NEEDED (reference):
├── CLAUDE.md          # Full development guide
├── docs/VISION.md     # Product vision
└── docs/FOR_AGENTS.md # Quick onboarding

TIER 3 - SPECIALIZED (domain-specific):
├── docs/LINGUISTIC_REFERENCE.md  # Linguistic debugging
├── docs/architecture/*           # Technical architecture
└── CONTRIBUTING.md               # Development patterns

TIER 4 - HISTORICAL (rarely needed):
└── docs/archive/*                # Old reports, decisions
```

---

## Implementation Status

- [x] Created AI_MODEL_GUIDE.md
- [x] Created ARCHITECTURE_REVIEW_2025_12.md
- [x] Updated CLAUDE.md with model selection
- [x] Updated FOR_AGENTS.md with model selection
- [x] Updated README.md file pointers
- [ ] Archive redundant docs (manual cleanup recommended)
- [ ] Slim CLAUDE.md (future task)

---

**Note:** Archiving is optional but recommended. The primary goal is ensuring new AI sessions load minimal context while having clear pointers to detailed docs when needed.
