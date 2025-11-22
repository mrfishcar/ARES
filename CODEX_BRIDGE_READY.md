# Codex Bridge - Ready to Use

**Status**: ✅ Complete and ready for testing on Nov 22nd when OpenAI credits refresh

## What We Built

An automated bridge that connects your Claude Code session to ChatGPT (Codex) to offload mechanical debugging work, saving expensive Claude tokens.

## Files Created

1. **`/scripts/codex-bridge.ts`** - Main automation script (490 lines)
   - Manages conversation context with Codex
   - Delegates tasks via OpenAI API
   - Returns results for Claude to analyze

2. **`/scripts/codex`** - Quick wrapper script
   - Makes it easy to run: `./scripts/codex <command>`

3. **`/docs/CODEX_BRIDGE_GUIDE.md`** - Complete documentation
   - Setup instructions
   - Usage examples
   - Workflow examples
   - Troubleshooting

## Quick Start (Nov 22+)

### 1. Set your OpenAI API key:
```bash
export OPENAI_API_KEY="sk-your-key-here"
```

### 2. Test it:
```bash
cd /Users/corygilford/ares
./scripts/codex status
```

### 3. Delegate your first task:
```bash
./scripts/codex task "Add logging to entities.ts and run test-meaning-layer.ts"
```

## How It Works

```
┌─────────────────────────────────────────────┐
│  You + Claude Code Session                  │
│  (Architecture & Analysis)                  │
└───────────────┬─────────────────────────────┘
                │
                │ 1. Claude identifies mechanical task
                │
                ▼
┌─────────────────────────────────────────────┐
│  ./scripts/codex task "..."                 │
│  (Codex Bridge Script)                      │
└───────────────┬─────────────────────────────┘
                │
                │ 2. Sends task to OpenAI API
                │
                ▼
┌─────────────────────────────────────────────┐
│  ChatGPT (Codex)                            │
│  - Runs tests                               │
│  - Adds logging                             │
│  - Investigates issues                      │
│  - Reports findings                         │
└───────────────┬─────────────────────────────┘
                │
                │ 3. Returns results
                │
                ▼
┌─────────────────────────────────────────────┐
│  Claude Analyzes Results                    │
│  - Interprets findings                      │
│  - Provides next steps                      │
│  - Makes architectural decisions            │
└─────────────────────────────────────────────┘
```

## Example Usage

```bash
# Debug a specific issue
./scripts/codex debug "app/engine/extract/entities.ts" "Empty subject IDs"

# Run and analyze a test
./scripts/codex test "test-meaning-layer.ts"

# Add logging to a file
./scripts/codex log "app/engine/orchestrator.ts" "Entity registration"

# General task delegation
./scripts/codex task "Investigate why coreference resolution isn't working"
```

## Cost Savings

**Before Codex Bridge:**
- Claude does everything: analysis + mechanical debugging
- Cost: ~$3 per million tokens (all Claude)
- Time: Claude's rate limits apply

**After Codex Bridge:**
- Claude: Architecture & analysis only
- Codex: Mechanical debugging (testing, logging, observation)
- Cost: ~$0.50-$5 per million tokens (depending on Codex model)
- Time: Parallel work possible

**Recommended model split:**
- Use `gpt-3.5-turbo` for simple mechanical tasks (very cheap)
- Use `gpt-4o` when Codex needs reasoning
- Use Claude for all architecture and complex analysis

## What's Different from Manual Coordination

**Manual (from HOW_TO_COORDINATE_WITH_CODEX.md)**:
1. You copy instructions from Claude
2. Paste them into ChatGPT web interface
3. Copy Codex's response
4. Paste it back to Claude
5. Repeat

**Automated (with Codex Bridge)**:
```bash
./scripts/codex task "instructions from Claude"
# Results appear automatically
```

No more copy-pasting!

## Token Efficiency Example

### Scenario: Debug empty relation subject IDs

**Old way (all Claude):**
- Task description: 200 tokens
- File context: 2000 tokens
- Test execution: 1000 tokens
- Log analysis: 1500 tokens
- **Total**: ~4700 tokens @ $3/M = **$0.014**

**New way (Claude + Codex):**
- Claude analyzes problem: 200 tokens @ $3/M = $0.0006
- Codex executes debugging: 4500 tokens @ $0.50/M = $0.00225
- **Total**: **$0.00285** (80% savings!)

Over 100 debugging sessions: **$1.40 vs $0.28** - saves $1.12

## Current Session Context

Today (Nov 20th) we:
1. ✅ Fixed extraction failures on long texts (Goliath story)
   - Fixed all `.pos` property access guards in entities.ts
   - All 11 locations now safely handle missing pos data

2. ✅ Enhanced wiki generation
   - Wikis now show relationships and co-occurring entities
   - Uses extraction context for rich content
   - No more blank wiki modals!

3. ✅ Built Codex Bridge automation
   - Full TypeScript implementation
   - OpenAI API integration
   - Conversation context management
   - Ready to test on Nov 22+

## Next Steps (Nov 22+)

1. **Get OpenAI API key**: https://platform.openai.com/api-keys

2. **Test the bridge**:
   ```bash
   export OPENAI_API_KEY="sk-..."
   ./scripts/codex status
   ```

3. **Try a simple task**:
   ```bash
   ./scripts/codex task "Check if ARES services are running on ports 4000 and 8000"
   ```

4. **Delegate real debugging**:
   ```bash
   ./scripts/codex debug "app/engine/extract/entities.ts" "Check APPOS filtering"
   ```

5. **Integrate into workflow**: Use it whenever Claude identifies mechanical tasks

## Documentation

- **Setup & Usage**: `/docs/CODEX_BRIDGE_GUIDE.md`
- **Script**: `/scripts/codex-bridge.ts`
- **Manual workflow**: `/docs/HOW_TO_COORDINATE_WITH_CODEX.md`

## Testing Checklist (Nov 22+)

- [ ] Set OPENAI_API_KEY environment variable
- [ ] Run `./scripts/codex status` - should show "API Key: Set"
- [ ] Run `./scripts/codex task "Say hello"` - should get Codex response
- [ ] Try delegating a real debugging task
- [ ] Verify context preservation across multiple tasks
- [ ] Test `./scripts/codex reset` command

## Known Issues

- None yet! Ready for first test.

## Support

If something doesn't work:
1. Check `/docs/CODEX_BRIDGE_GUIDE.md` troubleshooting section
2. View logs: `tail -f tmp/codex-bridge.log`
3. Reset context: `./scripts/codex reset`

---

**Created**: Nov 20, 2025
**Ready for use**: Nov 22, 2025 (when OpenAI credits refresh)
**Status**: Complete and tested (TypeScript compilation passes)
