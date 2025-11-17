#!/bin/bash

# Update Master Plan on Phase Completion
# Usage: ./scripts/update_master_plan.sh <phase_number>

PHASE=$1
PLAN_FILE="docs/ENTITY_EXTRACTION_MASTER_PLAN.md"
TIMESTAMP=$(date +"%Y-%m-%d")

if [ -z "$PHASE" ]; then
  echo "Usage: ./scripts/update_master_plan.sh <phase_number>"
  exit 1
fi

echo "📊 Updating Master Plan for Phase $PHASE completion..."

# Get metrics from latest test run
METRICS_FILE="/tmp/phase${PHASE}_metrics.json"
if [ -f "$METRICS_FILE" ]; then
  ENTITY_P=$(jq -r '.entity_precision' $METRICS_FILE)
  ENTITY_R=$(jq -r '.entity_recall' $METRICS_FILE)
  RELATION_P=$(jq -r '.relation_precision' $METRICS_FILE)
  RELATION_R=$(jq -r '.relation_recall' $METRICS_FILE)
else
  echo "⚠️  No metrics file found at $METRICS_FILE"
  ENTITY_P="N/A"
  ENTITY_R="N/A"
  RELATION_P="N/A"
  RELATION_R="N/A"
fi

# Update progress table
sed -i.bak "s/| \*\*Phase $PHASE\*\* | ⚪ Not Started /| **Phase $PHASE** | 🟢 Complete /" $PLAN_FILE
sed -i.bak "s/| \*\*Phase $PHASE\*\* | 🟡 In Progress /| **Phase $PHASE** | 🟢 Complete /" $PLAN_FILE

# Update metrics in table
# This is a simplified version - would need more sophisticated sed/awk for exact updates

# Update timestamp
sed -i.bak "s/\*\*Last Updated\*\*:.*/\*\*Last Updated\*\*: $TIMESTAMP by Auto-Update/" $PLAN_FILE

# Generate phase completion report
REPORT_FILE="docs/PHASE${PHASE}_COMPLETE.md"
cat > $REPORT_FILE << EOF
# Phase $PHASE Completion Report

**Date**: $TIMESTAMP
**Status**: ✅ Complete

---

## Metrics Achieved

- Entity Precision: $ENTITY_P
- Entity Recall: $ENTITY_R
- Relation Precision: $RELATION_P
- Relation Recall: $RELATION_R

---

## Tasks Completed

$(grep "### ${PHASE}\." $PLAN_FILE | sed 's/###/- /')

---

## Lessons Learned

[To be filled by team]

---

## Next Phase

Phase $((PHASE + 1)) is now unlocked and ready to begin.

See ENTITY_EXTRACTION_MASTER_PLAN.md for details.
EOF

echo "✅ Master Plan updated!"
echo "📄 Phase completion report: $REPORT_FILE"
echo "🔓 Phase $((PHASE + 1)) unlocked"

# Remove backup file
rm ${PLAN_FILE}.bak

exit 0
