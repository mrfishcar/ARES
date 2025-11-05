import { extractFromSegments } from './app/engine/extract/orchestrator';

async function test() {
  const text = `
The tech startup scene in San Francisco was buzzing with energy in early 2023. Jessica Martinez had just graduated from MIT with a degree in Computer Science when she founded DataFlow Technologies with her college roommate Rebecca Chen. The two women had become close friends during their time in Cambridge and decided to move to California together to pursue their entrepreneurial dreams.

Jessica's younger brother Daniel Martinez was already working at Google in Mountain View. He introduced Jessica to his colleague Michael Thompson, a senior engineer who had previously worked at Meta before joining Google in 2021. Michael became an early advisor to DataFlow Technologies and helped the founders navigate the complex landscape of Silicon Valley venture capital.

Rebecca's father, Dr. Thomas Chen, was a renowned professor at Stanford University. He taught computer science and had extensive connections in the tech industry. Dr. Chen introduced his daughter and Jessica to Sarah Williams, a partner at Sequoia Capital. Sarah was impressed by their pitch and decided to invest two million dollars in DataFlow Technologies during their seed round.

Meanwhile, Daniel married his longtime girlfriend Emma Rodriguez in a beautiful ceremony in Napa Valley. Emma worked as a product manager at Apple in Cupertino. She invited her former professor from Berkeley, Dr. James Anderson, to the wedding. Dr. Anderson had mentored Emma during her undergraduate years and remained a close friend of the family.

Jessica and Rebecca hired their first employees in March 2023. They brought on Alex Kim, a talented designer who had studied at the Rhode Island School of Design. Alex's sister Jennifer Kim was a marketing executive at Salesforce and helped spread the word about DataFlow Technologies through her professional network. The team also hired David Park, a backend engineer who had graduated from Carnegie Mellon University.

The company secured office space in the South of Market district in San Francisco. Their landlord, Robert Wilson, owned several properties in the area and had invested in numerous startups over the years. He offered them favorable terms because he believed in their vision. Robert's son Steven Wilson worked as a software engineer at Stripe and occasionally stopped by the DataFlow office to check on the progress.

As the company grew, Jessica reconnected with her former MIT advisor, Dr. Lisa Wang. Dr. Wang had been instrumental in shaping Jessica's research interests and was now leading the artificial intelligence lab at MIT. She agreed to join DataFlow's technical advisory board and flew out to San Francisco quarterly for board meetings.

Rebecca's older brother Andrew Chen worked as an investment banker at Goldman Sachs in New York. He provided financial advice to the startup and helped them understand term sheets and equity structures. Andrew married his wife Michelle Chen in 2020, and they lived in Manhattan with their two children.

The DataFlow team expanded rapidly throughout 2023. They hired Maria Garcia, a data scientist who had worked at Microsoft in Seattle before relocating to the Bay Area. Maria brought deep expertise in machine learning and had published several papers during her time at the University of Washington. Her husband Carlos Garcia was a civil engineer and worked on infrastructure projects throughout California.

By summer, the company had grown to fifteen employees. Jessica's mentor from her previous internship at Amazon, Kevin Lee, joined as Chief Technology Officer. Kevin had spent five years at Amazon in Seattle before the opportunity at DataFlow convinced him to move to San Francisco. He brought along two of his former teammates from Amazon, helping to strengthen the engineering team.

Rebecca focused on product development while Jessica handled business operations. They hired Rachel Green as their Chief Operating Officer. Rachel had previously worked at LinkedIn in Sunnyvale and had experience scaling startups from ten to one hundred employees. Her brother Mark Green was a venture capitalist at Andreessen Horowitz and provided valuable insights into the fundraising process.

The company's success attracted attention from major tech companies. Microsoft expressed interest in acquiring DataFlow Technologies, but Jessica and Rebecca decided to remain independent. They raised a Series A round led by Kleiner Perkins, with participation from existing investor Sequoia Capital. The twenty million dollar round valued the company at eighty million dollars.

Dr. Thomas Chen was proud of his daughter's achievements and wrote a case study about DataFlow Technologies for his entrepreneurship course at Stanford. Many of his students expressed interest in joining the company, and Rebecca began recruiting directly from Stanford's computer science program.

As 2023 came to a close, DataFlow Technologies had established itself as a rising star in the San Francisco tech ecosystem. The founding team's strong relationships, from MIT to Silicon Valley, had proven invaluable in building a successful company. Jessica and Rebecca's friendship, which began in a college dormitory in Cambridge, had evolved into a powerful business partnership that was reshaping the data analytics industry.
`;

  console.log('1000-WORD CONTEMPORARY NARRATIVE TEST');
  console.log('='.repeat(80));
  console.log(`Text length: ${text.trim().split(/\s+/).length} words`);
  console.log('='.repeat(80));

  const startTime = Date.now();
  const { entities, relations } = await extractFromSegments('1000-word-test', text);
  const duration = Date.now() - startTime;

  console.log(`\nProcessing time: ${duration}ms`);
  console.log(`\nEntities: ${entities.length}`);

  // Group by type
  const byType: Record<string, any[]> = {};
  for (const e of entities) {
    if (!byType[e.type]) byType[e.type] = [];
    byType[e.type].push(e);
  }

  for (const [type, ents] of Object.entries(byType).sort()) {
    console.log(`\n${type} (${ents.length}):`);
    for (const e of ents.sort((a, b) => a.canonical.localeCompare(b.canonical))) {
      console.log(`  - ${e.canonical}`);
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Relations: ${relations.length}`);
  console.log('='.repeat(80));

  // Group relations by type
  const relsByType: Record<string, any[]> = {};
  for (const rel of relations) {
    if (!relsByType[rel.pred]) relsByType[rel.pred] = [];
    relsByType[rel.pred].push(rel);
  }

  for (const [pred, rels] of Object.entries(relsByType).sort()) {
    console.log(`\n${pred} (${rels.length}):`);
    for (const rel of rels) {
      const subj = entities.find(e => e.id === rel.subj)?.canonical || rel.subj.slice(0, 8);
      const obj = entities.find(e => e.id === rel.obj)?.canonical || rel.obj.slice(0, 8);
      console.log(`  ${subj} → ${obj}`);
    }
  }

  // Statistics
  console.log(`\n${'='.repeat(80)}`);
  console.log('STATISTICS');
  console.log('='.repeat(80));
  console.log(`Words: ${text.trim().split(/\s+/).length}`);
  console.log(`Entities: ${entities.length}`);
  console.log(`Relations: ${relations.length}`);
  console.log(`Entity types: ${Object.keys(byType).length}`);
  console.log(`Relation types: ${Object.keys(relsByType).length}`);
  console.log(`Entities per 100 words: ${(entities.length / text.trim().split(/\s+/).length * 100).toFixed(1)}`);
  console.log(`Relations per 100 words: ${(relations.length / text.trim().split(/\s+/).length * 100).toFixed(1)}`);
  console.log(`Processing speed: ${(text.trim().split(/\s+/).length / (duration / 1000)).toFixed(0)} words/sec`);

  process.exit(0);
}

test().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
