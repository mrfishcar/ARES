/**
 * Demo: Generate Wiki Page for King David from 1-2 Samuel
 * Uses NIV text excerpts to demonstrate exposition generation on a major character
 */

import { extractEntities } from '../app/engine/extract/entities';
import { extractRelations } from '../app/engine/extract/relations';
import { compose } from '../app/generate/exposition';
import { toMarkdownPage } from '../app/generate/markdown';

async function generateKingDavidPage() {
  console.log('\n📖 Generating Wiki Page for King David from 1-2 Samuel (NIV)\n');

  // Sample text from 1 Samuel and 2 Samuel (NIV) - key narrative moments
  const corpus = `
David was the son of Jesse from Bethlehem. He was a shepherd who tended his father's sheep.

Samuel anointed David as the future king of Israel in Bethlehem. David was chosen by God to replace Saul as king.

David served in the court of King Saul. He played the harp for Saul to soothe the king's troubled spirit.
Saul made David a commander in his army.

David fought against Goliath, the Philistine giant from Gath. David killed Goliath with a sling and a stone.
After this victory, David became famous throughout Israel.

David was friends with Jonathan, the son of King Saul. Jonathan and David made a covenant of friendship.
Jonathan loved David as his own soul.

David married Michal, the daughter of King Saul. Saul gave Michal to David as his wife, hoping David would
be killed by the Philistines.

King Saul became jealous of David and tried to kill him. David fled from Saul and lived as a fugitive in
the wilderness. David hid in the cave of Adullam.

David gathered a band of men who became his followers. About four hundred men joined David at Adullam.
These men were his loyal companions during his years of exile.

David traveled to the land of the Philistines and lived in Gath. He later moved to Ziklag, where he stayed
for sixteen months.

After Saul died in battle at Mount Gilboa, David became king of Judah in Hebron. David ruled in Hebron for
seven years and six months.

David then became king over all Israel. He conquered Jerusalem and made it his capital city. Jerusalem became
known as the City of David.

David brought the Ark of the Covenant to Jerusalem. He danced before the Lord with all his might as the Ark
was brought into the city.

David wanted to build a temple for the Lord in Jerusalem. However, God told David through the prophet Nathan
that his son would build the temple instead.

David fought many battles against Israel's enemies. He defeated the Philistines, the Moabites, the Arameans,
and the Edomites. David's kingdom expanded greatly during his reign.

David had many wives and children. He married Abigail, Ahinoam, Maacah, Haggith, Abital, and Eglah. His sons
included Amnon, Absalom, Solomon, and Adonijah.

David committed adultery with Bathsheba, the wife of Uriah the Hittite. David then arranged for Uriah to be
killed in battle. The prophet Nathan confronted David about his sin.

David repented of his sin with Bathsheba. He wrote psalms of repentance and confession. Despite his sin,
David married Bathsheba after Uriah's death.

David and Bathsheba had a son named Solomon. God loved Solomon and chose him to be the next king of Israel.
Solomon would build the temple that David had desired to construct.

David's son Absalom rebelled against him and tried to take the throne. David fled from Jerusalem when Absalom
seized power. Absalom was eventually killed by Joab, David's military commander.

David returned to Jerusalem after Absalom's rebellion was crushed. He continued to rule as king until his
old age. David reigned over Israel for a total of forty years.

David appointed Solomon as his successor before he died. David gave Solomon instructions to follow God's laws
and to be strong and courageous. David died in Jerusalem and was buried in the City of David.
  `.trim();

  console.log('📚 Processing corpus...\n');

  // Extract entities and relations
  const { entities, spans } = await extractEntities(corpus);
  console.log(`✓ Extracted ${entities.length} entities`);

  const relations = await extractRelations(corpus, { entities, spans }, 'samuel-1-2');
  console.log(`✓ Extracted ${relations.length} relations\n`);

  // Find David entity
  const davidEntity = entities.find(e =>
    e.canonical.toLowerCase() === 'david' ||
    e.canonical.toLowerCase().includes('king david')
  );

  if (!davidEntity) {
    console.log('❌ Entity "David" not found in corpus.');
    console.log('\n📋 Available entities:');
    entities.slice(0, 20).forEach(e => console.log(`  - ${e.canonical} (${e.type})`));
    return;
  }

  console.log(`✓ Found entity: ${davidEntity.canonical} (${davidEntity.type})\n`);

  // Count relations involving David
  const davidRelations = relations.filter(r =>
    r.subj === davidEntity.id || r.obj === davidEntity.id
  );
  console.log(`✓ Found ${davidRelations.length} relations involving ${davidEntity.canonical}\n`);

  // Show sample relations
  if (davidRelations.length > 0) {
    console.log('📋 Sample relations:');
    davidRelations.slice(0, 10).forEach(rel => {
      const subj = entities.find(e => e.id === rel.subj);
      const obj = entities.find(e => e.id === rel.obj);
      console.log(`  - ${subj?.canonical} [${rel.pred}] ${obj?.canonical} (conf: ${rel.confidence.toFixed(2)})`);
    });
    console.log('');
  }

  // Generate wiki page
  console.log('📝 Generating wiki page...\n');
  const page = compose(davidEntity.id, entities, relations, []);
  const markdown = toMarkdownPage(page);

  console.log('━'.repeat(80));
  console.log(markdown);
  console.log('━'.repeat(80));

  // Print detailed summary
  console.log('\n📊 Page Summary:');
  console.log(`  - Total entities extracted: ${entities.length}`);
  console.log(`  - Total relations extracted: ${relations.length}`);
  console.log(`  - Relations involving David: ${davidRelations.length}`);
  console.log(`  - Infobox fields: ${Object.keys(page.infobox).length}`);
  console.log(`  - Overview: ${page.overview ? '✓' : '✗'}`);
  console.log(`  - Biography sentences: ${page.sections.biography.length}`);
  console.log(`  - Relationship sentences: ${page.sections.relationships.length}`);
  console.log(`  - Abilities sentences: ${page.sections.abilities.length}`);
  console.log(`  - Items sentences: ${page.sections.items.length}`);
  console.log(`  - Affiliations sentences: ${page.sections.affiliations.length}`);
  console.log(`  - Disputed claims: ${page.sections.disputed.length}`);
  console.log('');
}

generateKingDavidPage().catch(console.error);
