# 🔄 Restart Instructions

**Status**: Phase 2 code complete, needs verification
**Last update**: 2025-11-16
**Session**: Ready for fresh start

---

## ⚡ Quick Start (3 commands)

```bash
# 1. Verify no regression
npx ts-node test-meaning-layer.ts

# 2. Run Level 1 ladder test
npx vitest run tests/ladder/level-1-simple.spec.ts > /tmp/ladder_verify.log 2>&1

# 3. Check results
cat /tmp/ladder_verify.log | grep -B5 -A15 "SUMMARY"
```

**Expected**: Tests 1.13 & 1.14 should now pass (DATE entities extracted)

---

## 📊 What Should Happen

### If Successful ✅
- Meaning layer: Still passes
- Tests passing: 14+/20 (up from 12)
- DATE entities appear in tests 1.13, 1.14
- Recall increases slightly

**Next**: Move to Phase 3 (entity type fixes)

### If Issues ❌
Read `/Users/corygilford/ares/docs/PHASE2_CHECKPOINT.md` for troubleshooting

---

## 📁 Key Documents

1. **PHASE2_CHECKPOINT.md** - Full status, changes made, troubleshooting
2. **CODEX_SESSION2_HANDOFF.md** - Complete context (detailed)
3. **CODEX_QUICK_HANDOFF.md** - Compact version
4. This file - Quick restart guide

---

## 🎯 Current Mission

**Goal**: Pass Level 1 Ladder Test (P≥0.90, R≥0.85, F1≥0.87)

**Progress**:
- Phase 1: ✅ Done (canonicalization)
- Phase 2: ⏸️ Needs verification (DATE extraction)
- Phase 3: ⏳ Pending (entity types)
- Phase 4: ⏳ Pending (relation tuning)

**Current metrics**: Entities 0.879 F1, Relations 0.787 F1 (12/20 tests)

---

**Start here** → Run the 3 commands above and report what you see!
