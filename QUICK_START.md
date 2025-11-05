# ARES Quick Start

## Phase 1 Validation (2 minutes)

```bash
# Terminal 1
cd ares
make parser

# Terminal 2
make test    # Expect: 10 passed | 6 todo
make smoke   # Expect: 3/3 passed
```

**If green:** "Phase 1 green, ready for Phase 2"
**If blocked:** "Phase 1 blocked: [error]"

## Installation

```bash
make install  # One-time setup
```

See PILOTS_CARD.md for troubleshooting.
