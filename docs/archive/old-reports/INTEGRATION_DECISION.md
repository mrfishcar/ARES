# Integration Decision: Contextual Resolver

## Question
Should we integrate `contextual-resolver.ts` into `coref.ts` to replace the naive profile-based resolution?

## Answer
**No, not yet.** Keep as separate module for future use.

## Reasoning

### Current State (As of Oct 29, 2025)

**Working:**
- ✅ 119 tests passing
- ✅ Adaptive learning implemented and functional
- ✅ Profiles building correctly across documents
- ✅ Basic profile-based resolution working

**New Module:**
- ✅ `contextual-resolver.ts` - Multi-tier resolution engine
- ✅ `test-multiple-wizards.ts` - 4 test scenarios passing
- ✅ Handles ambiguity correctly (returns null when uncertain)

### Risk Analysis

**High Risk:**
- Different resolution choices might break existing tests
- Only tested on 4 synthetic scenarios, not real corpus
- Could introduce regressions we haven't anticipated
- Just added adaptive learning (big change already)

**Medium Risk:**
- More null returns (ambiguous cases won't resolve)
- Slightly slower performance (entity span scanning)
- Unknown edge cases in golden corpus (LotR, HP, Bible)

**Low Risk:**
- Logic is sound and well-documented
- Conservative ambiguity detection is safer
- Easy to integrate later if needed

### Why Not Now?

1. **Works is better than perfect**
   - Current system handles most cases fine
   - No urgent real-world "multiple wizards" problem
   - Premature optimization is dangerous

2. **Testing insufficient**
   - Only 4 synthetic test cases
   - No testing on full corpus
   - No integration tests with full pipeline

3. **Just shipped adaptive learning**
   - Big feature, needs stabilization
   - Let profiles accumulate first
   - See how they perform in practice

4. **Can integrate later**
   - Module is ready and documented
   - No technical blocker
   - Easy to add when needed

### What Could Change This Decision?

**Integrate if:**
- Real use case emerges (user reports multiple entity confusion)
- Golden corpus tests show issues with naive resolution
- Profiles accumulate and we see patterns of mis-resolution
- We have time for comprehensive integration testing

**Don't integrate if:**
- Current system continues to work fine
- No real-world issues reported
- Tests remain stable

## What We Built

### Completed ✅
1. **Entity Profiler** (`entity-profiler.ts`)
   - Builds profiles with descriptors, roles, attributes
   - Accumulates knowledge across documents
   - Persistent storage in graph JSON

2. **Contextual Resolver** (`contextual-resolver.ts`)
   - 3-tier resolution (paragraph → document → profile)
   - Ambiguity detection
   - Distance-based scoring
   - Ready for integration when needed

3. **Integration Points**
   - Orchestrator builds profiles during extraction
   - Storage persists profiles to JSON
   - Coref uses profiles (naive approach for now)

### Not Integrated ⏸️
- `contextual-resolver.ts` → remains separate module
- Can be imported and used when needed
- Full documentation available

## Recommendation

**Ship what we have:**
- Adaptive learning is a big win
- Profiles will improve over time
- Contextual resolver is documented and ready
- Conservative approach minimizes risk

**Monitor in practice:**
- See how profiles perform
- Watch for multiple entity confusion
- Gather real use cases

**Iterate later:**
- Integrate contextual resolver if needed
- Add feature flag for safe testing
- Comprehensive testing before production

## Technical Debt

**Low priority debt:**
- Naive profile resolution could miss edge cases
- Not critical since profiles are fallback (Tier 3)
- Easy to fix if becomes problem

**How to address later:**
1. Create feature flag: `USE_CONTEXTUAL_RESOLVER`
2. Run A/B test on golden corpus
3. Compare resolution quality
4. Integrate if improvement is significant

## Files Reference

**Implemented:**
- `app/engine/entity-profiler.ts` - Profile building ✅
- `app/engine/contextual-resolver.ts` - Smart resolution ⏸️
- `app/engine/coref.ts` - Uses profiles (naive) ✅
- `app/engine/extract/orchestrator.ts` - Builds profiles ✅
- `app/storage/storage.ts` - Persists profiles ✅

**Tests:**
- `test-adaptive-learning.ts` - End-to-end profiles ✅
- `test-multiple-wizards.ts` - Contextual resolver ✅

**Documentation:**
- `ADAPTIVE_LEARNING_COMPLETE.md` - Full overview
- `CONTEXTUAL_RESOLUTION_FIX.md` - Smart resolution
- `INTEGRATION_DECISION.md` - This document

## Conclusion

**Decision: Don't integrate contextual resolver yet.**

**Rationale: Ship working adaptive learning, iterate based on real usage.**

**Status: Adaptive learning production-ready. Contextual resolver available for future use.**

---

**Date:** October 29, 2025
**Decision Maker:** User + Claude Code
**Status:** Final (revisit if real issues emerge)
