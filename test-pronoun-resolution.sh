#!/bin/bash
# Test Claude Online's pronoun resolution fix

echo "🧪 Testing Pronoun Resolution Fix"
echo "=================================="
echo ""

STORY='Frederick rapped on the door twice. The white columns before him seemed to reach up to the Heavens. He had come from a humble apartment in a nearby city. Justice moved him. God knew the mailman who lived beyond this door had killed his wife. The caged wall lamps hanging from the porch'\''s rafters looked on, uncaring.

A shadow appeared behind the frosted panes. Heavy locks clicked and grinded and the door finally swung inward.

"Hello, Frederick," Charles Garrison greeted. "How was your journey?"

Frederick spoke: "Steamy. Familiar. Like I'\''ve been here before."

"Are you in the mood for some songs?" Charles asked. "I'\''ve got a new record that just arrived, and I bet it'\''ll make you glad you drove all this way."

"Sure." Frederick paused. "I have some questions, Charles. There were things I was hoping we could discuss. You'\''re a powerful man, a man of certain connections. I'\''m hoping that—"

"Frederick." Charles gently interrupted. "Let'\''s sit, have a drink, and listen to the record first, all right? I think you'\''ll be able to find the answers you seek very soon."

"Of course," Frederick said. "That sounds great."

They moved into the dim of the manor. Charles indicated a room to the left, its doorway covered by a black screen. "Please, step inside," Charles said. Frederick passed through, and the door shut behind him.

Frederick adjusted his eyes to the darkness. Perched upon a chandelier above, a demon named Saul looked down and spoke: "Hello, friend."'

echo "📤 Sending extraction request..."
echo ""

RESULT=$(curl -s -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation { extractEntities(text: \\\"${STORY//\"/\\\\\\\"}\\\") { entities { id type canonical aliases confidence } relations { subj pred obj } } }\"}")

echo "📊 Results:"
echo "$RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
entities = data['data']['extractEntities']['entities']
relations = data['data']['extractEntities']['relations']

print(f'\n  Total Entities: {len(entities)}')
print(f'  Total Relations: {len(relations)}')

print('\n👤 Entities:')
pronouns = {'he', 'she', 'it', 'they', 'him', 'her', 'his', 'hers', 'them', 'their'}

frederick = None
saul = None
has_pronoun_issues = False

for entity in entities:
    print(f'\n  {entity[\"type\"]}::{entity[\"canonical\"]}')
    print(f'    Confidence: {entity[\"confidence\"]*100:.1f}%')
    print(f'    Aliases: [{\"', '\".join(entity[\"aliases\"])}]')

    # Check for pronouns in aliases
    entity_pronouns = [a for a in entity['aliases'] if a.lower() in pronouns]
    if entity_pronouns:
        print(f'    ❌ ERROR: Pronouns in aliases: {entity_pronouns}')
        has_pronoun_issues = True
    else:
        print(f'    ✅ No pronouns in aliases')

    # Track Frederick and Saul
    if 'frederick' in entity['canonical'].lower():
        frederick = entity
    if 'saul' in entity['canonical'].lower():
        saul = entity

print('\n🔍 Key Verifications:')

if frederick:
    print(f'  ✅ Frederick found: \"{frederick[\"canonical\"]}\"')
else:
    print(f'  ❌ Frederick NOT found')

if saul:
    print(f'  ✅ Saul found: \"{saul[\"canonical\"]}\"')
else:
    print(f'  ❌ Saul NOT found')

if frederick and saul:
    if frederick['id'] != saul['id']:
        print(f'  ✅ Frederick and Saul are SEPARATE entities (no pronoun merge)')
    else:
        print(f'  ❌ Frederick and Saul were MERGED (pronoun bug still exists)')

if not has_pronoun_issues:
    print(f'\n🎉 PASS: No pronouns found in entity aliases!')
else:
    print(f'\n❌ FAIL: Pronouns still being stored in aliases')

print('')
"

echo "=================================="
