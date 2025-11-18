# 🤖 ARES AI Collaboration Watcher

Automated orchestration system for Claude ↔ Codex handoffs.

## Quick Start

**Single command to launch:**

```bash
./scripts/launch-watcher.sh
```

That's it! The launcher handles everything:
- ✅ Checks dependencies
- ✅ Installs missing packages
- ✅ Creates handoff document
- ✅ Starts the watcher

## How It Works

1. **File Watching**: Monitors `docs/AI_HANDOFF.md` for changes
2. **Auto-Dispatch**: Reads "NEXT: Claude" or "NEXT: Codex"
3. **Task Creation**: Writes task files to `/tmp/` for each AI to pick up
4. **Safety Limits**: Auto-pauses after 50 iterations or 30min timeout

## Controls

While the watcher is running:

| Key | Action |
|-----|--------|
| `p` | **Pause** - Stop processing handoffs |
| `r` | **Resume** - Continue processing |
| `s` | **Status** - Show current state |
| `k` | **KILL** - 🛑 Emergency stop everything |
| `q` | **Quit** - Exit gracefully |

## Handoff Document Format

`docs/AI_HANDOFF.md` structure:

```markdown
# AI Handoff Document

**Status**: WORKING
**Iteration**: 5

## Current Task
Description of what needs to be done

## Instructions for Codex
1. Step 1
2. Step 2
3. Update this document when done

## Instructions for Claude
1. Review Codex's work
2. Run tests
3. Hand back if needed

## NEXT: Codex
```

The watcher triggers when you update this file and reads the `NEXT:` section.

## Safety Features

- **Max Iterations**: Auto-pause after 50 handoffs
- **Timeout Detection**: Auto-pause if no updates for 30 minutes
- **Kill Switch**: Press `k` to immediately stop everything
- **Pause/Resume**: Control the flow without losing state

## Task Files

When triggered, the watcher creates:

- `/tmp/claude_task.md` - Instructions for Claude Code
- `/tmp/codex_task.md` - Instructions for Codex

Each AI can watch these files and automatically pick up work.

## Example Workflow

1. **Start watcher**: `./scripts/launch-watcher.sh`
2. **Codex completes task**: Updates `AI_HANDOFF.md` with "NEXT: Claude"
3. **Watcher detects change**: Writes task to `/tmp/claude_task.md`
4. **Claude picks up task**: Reviews and updates with "NEXT: Codex"
5. **Loop continues**: Automated collaboration!

## Stopping

- **Normal**: Press `q` to quit gracefully
- **Emergency**: Press `k` for immediate kill switch
- **Process**: `Ctrl+C` also triggers clean shutdown

## Logs

Watch the terminal for real-time updates:
- 📋 Iteration number and target
- ⏰ Timestamp of each handoff
- ✅ Success/error messages
- 📊 Status information

## Troubleshooting

**Watcher not starting:**
```bash
# Check dependencies
npm install

# Try manual run
npx ts-node scripts/watch-ares.ts
```

**File not found errors:**
```bash
# Ensure you're in ARES root
cd /Users/corygilford/ares
./scripts/launch-watcher.sh
```

**Stuck on pause:**
- Press `r` to resume
- Press `s` to check status
- Press `k` to kill and restart

---

**Built by**: Claude (Sonnet 4.5)
**For**: Automated AI collaboration on ARES
