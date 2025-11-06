# Getting Started with ARES

**ARES** (Advanced Relation Extraction System) is a local-first entity and relation extraction engine that transforms unstructured text into structured knowledge graphs.

## What You'll Learn

This guide will help you:
1. Install ARES and its dependencies
2. Run your first extraction
3. Understand the output
4. Use the testing suite

## Prerequisites

- **Node.js** 16+ and npm
- **Python** 3.8+ with pip
- **Make** (for running commands)
- **Git** (for cloning the repository)

## Installation

### 1. Clone and Install Dependencies

```bash
# Clone the repository
git clone https://github.com/yourusername/ARES.git
cd ARES

# Install all dependencies (Node.js + Python)
make install
```

This will:
- Install Node.js packages (`npm install`)
- Install Python dependencies (spaCy + models)
- Download the spaCy English model (`en_core_web_sm`)

### 2. Start the Parser Service

ARES uses a Python-based spaCy parser service for NLP tasks. You need to start this service before running extractions:

```bash
# Terminal 1: Start the parser service
make parser
```

This starts the spaCy parser on port 8000. Keep this terminal running.

**Verify it's working:**
```bash
curl http://127.0.0.1:8000/health
# Should return: {"status":"ok","model":"en_core_web_sm"}
```

### 3. Run the Test Suite

In a new terminal, verify everything is working:

```bash
# Terminal 2: Run all tests
make test

# Expected output: 119/119 passing ✅
```

If tests pass, you're ready to go!

## Your First Extraction

### Quick Smoke Test

Run the smoke test to verify basic functionality:

```bash
make smoke
```

This runs 3 quick tests on small text samples.

### Extract from Text

Here's a simple example of extracting entities and relations from text:

```javascript
// example.js
import { extractFromSegments } from './app/engine/extract/orchestrator.js';

const text = `
Aragorn, son of Arathorn, married Arwen in 3019.
Gandalf the Grey traveled to Minas Tirith.
Frodo inherited the Ring from Bilbo.
`;

const result = await extractFromSegments('test-doc', text);

console.log('Entities:', result.entities.length);
result.entities.forEach(e => {
  console.log(`  - ${e.canonical} (${e.type})`);
});

console.log('\nRelations:', result.relations.length);
result.relations.forEach(r => {
  const subj = result.entities.find(e => e.id === r.subj)?.canonical;
  const obj = result.entities.find(e => e.id === r.obj)?.canonical;
  console.log(`  - ${subj} ${r.pred} ${obj}`);
});
```

Run it:
```bash
npx ts-node example.js
```

**Expected output:**
```
Entities: 7
  - Aragorn (PERSON)
  - Arathorn (PERSON)
  - Arwen (PERSON)
  - Gandalf (PERSON)
  - Minas Tirith (PLACE)
  - Frodo (PERSON)
  - Bilbo (PERSON)

Relations: 5
  - Arathorn parent_of Aragorn
  - Aragorn child_of Arathorn
  - Aragorn married_to Arwen
  - Arwen married_to Aragorn
  - Gandalf traveled_to Minas Tirith
```

## Understanding the Output

### Entities

Each entity has:
- `id`: Unique identifier (UUID)
- `eid`: Stable cross-document entity ID (if enabled)
- `type`: Entity type (PERSON, PLACE, ORG, DATE, etc.)
- `canonical`: Primary name
- `aliases`: Alternative names
- `attrs`: Additional attributes

### Relations

Each relation has:
- `id`: Unique identifier
- `subj`: Subject entity ID
- `pred`: Predicate/relation type
- `obj`: Object entity ID
- `evidence`: Source text and location
- `confidence`: Extraction confidence (0-1)
- `extractor`: Which extraction method found it

### Spans

Spans mark where entities appear in the text:
- `entity_id`: Which entity this span refers to
- `start`: Character offset (start)
- `end`: Character offset (end)

## Available Commands

```bash
make help        # Show all available commands
make install     # One-time setup
make parser      # Start spaCy parser service (required)
make test        # Run all tests
make smoke       # Quick validation tests
make clean       # Remove generated files
```

## Common Issues

### Parser Service Not Running

**Error:** `ECONNREFUSED 127.0.0.1:8000`

**Solution:** Start the parser service in a separate terminal:
```bash
make parser
```

### Port Already in Use

**Error:** `Address already in use: 8000`

**Solution:** Kill the existing process:
```bash
# Find and kill the process using port 8000
lsof -ti:8000 | xargs kill -9

# Or use pkill
pkill -f parser_service
```

### Tests Failing

If tests fail after installation:

1. Ensure parser service is running
2. Re-install dependencies: `make install`
3. Check Python version: `python --version` (need 3.8+)
4. Check Node version: `node --version` (need 16+)

### spaCy Model Not Found

**Error:** `Can't find model 'en_core_web_sm'`

**Solution:** Manually download the model:
```bash
python -m spacy download en_core_web_sm
```

## Next Steps

Now that you have ARES running:

1. **Learn the Architecture** - Read [ARCHITECTURE.md](ARCHITECTURE.md) to understand how ARES works
2. **Explore the API** - See [API_REFERENCE.md](API_REFERENCE.md) for GraphQL API docs
3. **Contribute** - Read [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) to add patterns or features
4. **HERT System** - Learn about stable entity references in [HERT_SPECIFICATION.md](HERT_SPECIFICATION.md)

## Getting Help

- **Issues:** Report bugs at https://github.com/yourusername/ARES/issues
- **Documentation:** Browse the `docs/` directory
- **Tests:** Look at `tests/` for examples and usage patterns

## Quick Reference

### Directory Structure

```
ARES/
├── app/
│   ├── engine/          # Extraction engine
│   ├── storage/         # Data persistence
│   ├── api/             # GraphQL API
│   └── ui/              # Web interface
├── tests/               # Test suites
│   ├── ladder/          # Progressive difficulty tests
│   ├── golden/          # Golden corpus tests
│   └── integration/     # Integration tests
├── scripts/             # Utility scripts
├── docs/                # Documentation
└── data/                # Data storage
```

### Core Files

- `app/engine/extract/orchestrator.ts` - Main extraction pipeline
- `app/engine/extract/entities.ts` - Entity extraction
- `app/engine/extract/relations.ts` - Relation extraction
- `app/engine/schema.ts` - Type definitions
- `scripts/parser_service.py` - spaCy parser service

---

**Ready to extract some knowledge!** 🚀
