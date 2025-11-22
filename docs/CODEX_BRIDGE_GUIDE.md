# Codex Bridge - Automated Claude ↔ Codex Coordination

## Overview

The Codex Bridge automatically connects your Claude Code session to ChatGPT (Codex) to offload mechanical debugging work, saving expensive Claude tokens for architecture and analysis.

**Cost Savings**:
- Claude Sonnet: ~$3 per million input tokens
- GPT-4o: ~$5 per million tokens (but can handle repetitive tasks)
- GPT-3.5-turbo: ~$0.50 per million tokens (cheap for mechanical work)

**Token Efficiency**:
- Use Claude for: Architecture, analysis, complex reasoning
- Use Codex for: Running tests, adding logs, mechanical debugging

## Setup

### 1. Get OpenAI API Key

Visit: https://platform.openai.com/api-keys

Create a new API key and copy it.

### 2. Set Environment Variable

```bash
# Add to your ~/.zshrc or ~/.bashrc:
export OPENAI_API_KEY="sk-..."

# Or set temporarily:
export OPENAI_API_KEY="sk-..."
```

### 3. Choose Model (Optional)

```bash
# Default: gpt-4o (smarter, more expensive)
export CODEX_MODEL="gpt-4o"

# Or use cheaper model for simple tasks:
export CODEX_MODEL="gpt-3.5-turbo"
```

### 4. Test Installation

```bash
cd /Users/corygilford/ares
./scripts/codex status
```

Should show:
```
Codex Bridge Status:
- Model: gpt-4o
- Conversation messages: 1
- Last update: 2025-11-20...
- API Key: Set
```

## Usage

### Quick Commands

```bash
# From project root:
./scripts/codex <command> [args]

# Or using full path:
npx ts-node scripts/codex-bridge.ts <command> [args]
```

### Common Commands

#### 1. Delegate a Task

```bash
./scripts/codex task "Add debug logging to the APPOS filter in entities.ts"
```

#### 2. Debug a Specific File

```bash
./scripts/codex debug "app/engine/extract/entities.ts" "Relations have empty subject IDs"
```

#### 3. Run and Analyze a Test

```bash
./scripts/codex test "test-meaning-layer.ts"
```

#### 4. Add Logging

```bash
./scripts/codex log "app/engine/extract/entities.ts" "Line 640, before filtering relations"
```

#### 5. Check Status

```bash
./scripts/codex status
```

#### 6. Reset Conversation

```bash
./scripts/codex reset
```

## Example Workflow: Claude + Codex Coordination

### Scenario: Debugging Empty Relation Subject IDs

**Step 1: Claude identifies the problem**

In Claude Code session:
> "Relations are being created but subject IDs are empty. This needs investigation."

**Step 2: Claude delegates to Codex**

```bash
./scripts/codex task "Investigate why relation subject IDs are empty:
1. Add logging to coreference resolution (app/engine/coreference.ts line 220)
2. Run test-meaning-layer.ts
3. Report what values are being assigned to relation.subj
4. Check if entity IDs are being resolved correctly"
```

**Step 3: Codex executes and reports**

Codex will:
- Read the specified files
- Add logging code
- Run the test
- Analyze the output
- Report findings

```
=== CODEX RESPONSE ===

## Findings
- Added logging to coreference.ts line 220
- Ran test-meaning-layer.ts
- Subject IDs are being set to "" (empty string)
- Object IDs are correctly set to UUIDs like "cadc7a94-..."

## Commands Run
- npx tsc
- npx ts-node test-meaning-layer.ts

## Output/Logs
[COREF] Relation created: subj="" obj="cadc7a94-45a7-..." pred="rules"
[COREF] Entity lookup for "Frederick" returned: undefined

## Hypothesis
The entity ID lookup for subjects is returning undefined, causing
empty strings to be used as fallback values.

## Questions for Claude
- Should we check the entity registry implementation?
- Is there a timing issue where entities aren't registered yet?
```

**Step 4: Claude analyzes and provides guidance**

Claude (in this session):
> "The hypothesis is correct - entity lookup is failing for subjects. This indicates the entity registry isn't populated before coreference resolution runs. Check the orchestrator.ts to verify entity registration happens before relation extraction. Codex: Add logging to the entity registry registration in orchestrator.ts."

**Step 5: Iterate until fixed**

Continue the loop: Claude analyzes → Codex investigates → Claude guides → Codex executes

## Advanced Usage

### Chaining Multiple Tasks

```bash
# Run a series of debugging steps
./scripts/codex task "Multi-step investigation:
1. Check if parser service is running (curl localhost:8000/health)
2. Run entity extraction test (npx ts-node test-simple-entity.ts)
3. Add logging to entities.ts line 100
4. Re-run test and compare output
5. Report any differences"
```

### Examining Multiple Files

```bash
./scripts/codex debug "app/engine/coreference.ts app/engine/orchestrator.ts" "Entity IDs not being passed to relation creation"
```

### Context Preservation

The bridge maintains conversation context across multiple invocations:

```bash
# First task
./scripts/codex task "Add logging to entities.ts"

# Codex remembers context from first task
./scripts/codex task "Now run the test with that logging"

# Codex still has full context
./scripts/codex task "Based on those logs, add more logging to coreference.ts"
```

To start fresh:
```bash
./scripts/codex reset
```

## Integration with Claude Code

### Method 1: Claude Delegates Explicitly

In your conversation with Claude, say:

> "Claude, please delegate this debugging task to Codex:
> - Add logging to APPOS filter
> - Run test-meaning-layer.ts
> - Report findings"

Claude will respond with the command to run:

```bash
./scripts/codex task "Add logging to APPOS filter in entities.ts, run test-meaning-layer.ts, and report findings"
```

### Method 2: Automated (Future Enhancement)

Future version could monitor Claude's output and automatically delegate tasks marked with a special syntax like:

```
@codex: Add logging to entities.ts line 640
```

## Cost Optimization Tips

1. **Use cheaper model for mechanical tasks**:
   ```bash
   export CODEX_MODEL="gpt-3.5-turbo"
   ```

2. **Reset context when switching topics**:
   ```bash
   ./scripts/codex reset
   ```

3. **Be specific in task descriptions** to minimize back-and-forth

4. **Batch related tasks** into one delegation

## Troubleshooting

### "OPENAI_API_KEY not set"

```bash
export OPENAI_API_KEY="sk-your-key-here"
```

### "Command not found: npx"

Install Node.js: https://nodejs.org/

### "Module not found"

```bash
cd /Users/corygilford/ares
npm install
```

### Codex gives irrelevant responses

Try resetting context:
```bash
./scripts/codex reset
```

Then be more specific in your next task description.

### API Rate Limits

OpenAI has rate limits. If you hit them:
- Wait a few minutes
- Consider upgrading your OpenAI plan
- Use a cheaper model (gpt-3.5-turbo)

## Logs

All activity is logged to:
```
/Users/corygilford/ares/tmp/codex-bridge.log
```

View logs:
```bash
tail -f tmp/codex-bridge.log
```

## Security Notes

- Never commit your OPENAI_API_KEY to git
- The key is stored in environment variables only
- Conversation context is saved locally in `tmp/codex-context.json`
- Context includes file contents from the project (but stays local)

## Future Enhancements

- [ ] Interactive mode with real-time chat
- [ ] Web UI for easier coordination
- [ ] Automatic task detection from Claude output
- [ ] Cost tracking and optimization
- [ ] Multi-agent coordination (Claude + Codex + specialized agents)
- [ ] Integration with Claude's MCP (Model Context Protocol)

## Support

Questions or issues? Check:
- This guide: `/Users/corygilford/ares/docs/CODEX_BRIDGE_GUIDE.md`
- Bridge script: `/Users/corygilford/ares/scripts/codex-bridge.ts`
- Original workflow: `/Users/corygilford/ares/docs/HOW_TO_COORDINATE_WITH_CODEX.md`
