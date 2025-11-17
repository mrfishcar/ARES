#!/bin/bash

# Add new task to Master Plan backlog
# Usage: ./scripts/add_task.sh "Task description" <hours>

DESCRIPTION="$1"
HOURS=$2
PLAN_FILE="docs/ENTITY_EXTRACTION_MASTER_PLAN.md"
TIMESTAMP=$(date +"%Y-%m-%d")

if [ -z "$DESCRIPTION" ] || [ -z "$HOURS" ]; then
  echo "Usage: ./scripts/add_task.sh \"Task description\" <hours>"
  exit 1
fi

echo "📝 Adding task to backlog: $DESCRIPTION ($HOURS hours)"

# Add to backlog section (or create if doesn't exist)
if ! grep -q "## Backlog" $PLAN_FILE; then
  cat >> $PLAN_FILE << EOF

---

# Backlog

Tasks identified but not yet scheduled:

EOF
fi

# Append task
cat >> $PLAN_FILE << EOF
- [ ] **$DESCRIPTION** (Est: ${HOURS}h, Added: $TIMESTAMP)
EOF

echo "✅ Task added to backlog"

exit 0
