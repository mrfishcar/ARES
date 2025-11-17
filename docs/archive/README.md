# ARES Documentation Archive

**Purpose**: This archive preserves historical documentation for context and reference, while keeping the main docs directory focused on current, actionable information.

**Last Updated**: 2025-11-13 (Week 2 Consolidation by Libby)

---

## What's Archived Here

### Status Reports (`/status/`)

Historical progress reports, status updates, and sprint summaries that have been consolidated into `/docs/STATUS.md`. These provide valuable context on project evolution but are no longer the primary reference.

**Current Source of Truth**: `/docs/STATUS.md`

### Agent Instructions (`/instructions/`)

Task-specific instructions and prompts for various AI agents that were created during development. These have been superseded by:
- `/docs/VISION.md` - Project vision and direction
- `/CONTRIBUTING.md` - How to contribute without breaking things
- `/docs/FOR_AGENTS.md` - Quick onboarding for new agents

**Why Archived**: The project has pivoted from entity extraction focus to manual override system focus. Old agent instructions reflect outdated priorities.

### Testing Strategies (`/testing/`)

Evolution of testing approaches showing how the team converged on the current integrated testing ladder.

**Current Source of Truth**: `/docs/testing/TESTING_STRATEGY.md`

### Old Reports (`/old-reports/`)

Pre-existing archive from earlier consolidation efforts. Preserved for continuity.

---

## How to Use This Archive

### Finding Historical Context

1. Check the current docs first (`/docs/STATUS.md`, `/docs/VISION.md`, etc.)
2. If you need historical context (why was X decision made?), search the archive
3. Each archived file has frontmatter showing what replaced it

### Archive File Naming

Format: `YYYY-MM-DD_original-filename.md`

Example: `2025-11-13_ares-status-report.md`

### Archive Frontmatter

Each archived file includes:
```markdown
---
archived: true
archived_date: 2025-11-13
replaced_by: /docs/STATUS.md
reason: Consolidated into STATUS.md during Week 2 cleanup
---
```

---

## Archive Statistics

**Pre-Consolidation** (2025-11-13):
- Total markdown files: 50+
- Root directory: 42 .md files
- Docs directory: 62 .md files (including old-reports)
- Redundant status reports: 15+
- Redundant testing docs: 3
- Redundant agent instructions: 8+

**Post-Consolidation** (2025-11-13):
- Target: ~20 core documentation files
- Reduction: 60% (50+ → ~20)
- Archived: 25+ files
- Deleted: 5+ truly redundant files (session summaries, exact duplicates)

---

## What's NOT Archived

The following remain as current documentation:

### Core Documentation (Active)
- `/README.md` - Project overview
- `/docs/VISION.md` - Project vision and roadmap
- `/docs/STATUS.md` - Current project status
- `/CONTRIBUTING.md` - Contribution guidelines
- `/docs/FOR_AGENTS.md` - Agent onboarding guide

### Architecture Documentation (Active)
- `/docs/architecture/MANUAL_OVERRIDE_DESIGN.md` - Manual override system design
- `/docs/architecture/HERT_IMPLEMENTATION.md` - HERT system docs
- `/docs/architecture/*.md` - Current architectural decisions

### Testing Documentation (Active)
- `/docs/testing/TESTING_STRATEGY.md` - Unified testing strategy
- `/docs/testing/reports/*.md` - Recent test reports

### Guides (Active)
- `/docs/guides/QUICK_START.md` - Getting started guide
- `/docs/guides/DESKTOP_TESTER_QUICKSTART.md` - Desktop tester guide

---

## Maintenance Guidelines

### When to Archive

Archive a document when:
1. It has been superseded by newer documentation
2. Its information has been consolidated elsewhere
3. It provides historical context but is no longer actionable
4. It reflects outdated project direction/priorities

### When to Delete

Delete a document when:
1. It is an exact duplicate of another file
2. It contains no unique information
3. It is a temporary file (session notes, scratch work)
4. It has no historical value

### When to Keep Active

Keep a document active when:
1. It is the current source of truth for a topic
2. It is actively maintained and updated
3. It is referenced by other active documentation
4. It provides actionable guidance for current work

---

## Questions?

If you're unsure whether something should be archived:
- Ask: "Does this inform current work or just provide history?"
- Check: Is there a newer version of this document?
- Verify: Is this information in `/docs/STATUS.md` or `/docs/VISION.md`?

When in doubt, archive rather than delete. Disk space is cheap; lost context is expensive.

---

**Archival Policy**: Documents are preserved for 1 year minimum. After 1 year, documents with zero references may be candidates for deletion.

**Last Consolidation**: 2025-11-13 (Week 2, Libby)
**Next Review**: 2026-01-13 (2 months)
