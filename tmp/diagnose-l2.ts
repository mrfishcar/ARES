import { appendDoc, clearStorage } from "../app/storage/storage";
import * as fs from "fs";

const failingTests = [
  {
    id: '2.1',
    text: 'Harry went to Hogwarts. He studied magic there.',
    expectedRelations: ['Harry traveled_to Hogwarts', 'Harry studies_at Hogwarts']
  },
  {
    id: '2.4',
    text: 'Aragorn married Arwen. He loved her deeply.',
    expectedRelations: ['Aragorn married_to Arwen', 'Arwen married_to Aragorn']
  },
  {
    id: '2.9',
    text: 'Aragorn became king of Gondor. The king ruled wisely.',
    expectedRelations: ['Aragorn rules Gondor']
  },
  {
    id: '2.10',
    text: 'Dumbledore is a wizard. The wizard teaches at Hogwarts.',
    expectedRelations: ['Dumbledore teaches_at Hogwarts']
  },
  {
    id: '2.14',
    text: 'Theoden ruled Rohan. Eowyn was his niece. She lived in Rohan.',
    expectedRelations: ['Theoden rules Rohan', 'Eowyn lives_in Rohan']
  }
];

async function diagnose() {
  for (const test of failingTests) {
    console.log("\n" + "=".repeat(60));
    console.log("TEST " + test.id + ": " + test.text);
    console.log("=".repeat(60));
    console.log("Expected: " + test.expectedRelations.join(', '));

    const filePath = "/tmp/test-" + test.id + ".json";
    clearStorage(filePath);

    try {
      const result = await appendDoc(test.id, test.text, filePath);
      const graph = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      console.log("\nExtracted Entities: " + graph.entities.map((e: any) => e.canonical + "(" + e.type + ")").join(', '));
      console.log("\nExtracted Relations:");
      for (const rel of graph.relations) {
        const subj = graph.entities.find((e: any) => e.id === rel.subj);
        const obj = graph.entities.find((e: any) => e.id === rel.obj);
        console.log("  - " + (subj?.canonical || rel.subj_surface || '?') + " --[" + rel.pred + "]--> " + (obj?.canonical || rel.obj_surface || '?'));
      }

      // Check which expected relations are missing
      console.log("\nMissing Relations:");
      let missingCount = 0;
      for (const expected of test.expectedRelations) {
        const parts = expected.split(' ');
        const subjName = parts[0];
        const pred = parts[1];
        const objName = parts[2];
        const found = graph.relations.some((rel: any) => {
          const subjE = graph.entities.find((e: any) => e.id === rel.subj);
          const objE = graph.entities.find((e: any) => e.id === rel.obj);
          const subjMatch = subjE?.canonical === subjName || rel.subj_surface === subjName;
          const objMatch = objE?.canonical === objName || rel.obj_surface === objName;
          return subjMatch && rel.pred === pred && objMatch;
        });
        if (!found) {
          console.log("  X " + expected);
          missingCount++;
        }
      }
      if (missingCount === 0) {
        console.log("  (none)");
      }
    } catch (e) {
      console.log("Error: " + e);
    }
  }
}

diagnose().catch(console.error);
