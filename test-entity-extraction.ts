/**
 * Test Entity Extraction from Notes
 *
 * This script tests the full pipeline:
 * 1. Create a note with #EntityName:TYPE tags
 * 2. Verify entities are created in graph.json
 * 3. Confirm they can be queried via GraphQL
 */

import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';

const API_URL = 'http://localhost:4000/';
const PROJECT = 'test';
const GRAPH_PATH = `./data/projects/${PROJECT}/graph.json`;

async function graphqlQuery(query: string, variables?: any) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });

  const result = await response.json();
  if (result.errors) {
    console.error('GraphQL errors:', result.errors);
    throw new Error('GraphQL query failed');
  }

  return result.data;
}

async function main() {
  console.log('🧪 Testing Entity Extraction from Notes\n');

  // Get initial entity count
  const initialGraph = fs.existsSync(GRAPH_PATH)
    ? JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf-8'))
    : { entities: [] };

  const initialCount = initialGraph.entities.length;
  console.log(`📊 Initial entities in graph: ${initialCount}`);

  // Create a note with entity tags
  console.log('\n✍️  Creating note with entity tags...');
  const noteMarkdown = `# My First Note

This is a test note about Middle-earth.

#Frodo:PERSON is a hobbit from the #Shire:PLACE. He embarked on a quest to destroy the #One Ring:ITEM.

He was guided by #Gandalf:PERSON, a wizard of great power.

The journey took them through #Rivendell:PLACE and across many lands.`;

  const createNoteMutation = `
    mutation CreateNote($project: String!, $input: NoteInput!) {
      createNote(project: $project, input: $input) {
        id
        markdown
        createdAt
      }
    }
  `;

  const note = await graphqlQuery(createNoteMutation, {
    project: PROJECT,
    input: {
      title: 'Test Entity Extraction',
      markdown: noteMarkdown
    }
  });

  console.log(`✅ Note created with ID: ${note.createNote.id}`);

  // Wait a moment for file writes
  await new Promise(resolve => setTimeout(resolve, 500));

  // Check graph.json for new entities
  console.log('\n🔍 Checking graph.json for new entities...');

  if (!fs.existsSync(GRAPH_PATH)) {
    console.error('❌ graph.json was not created!');
    return;
  }

  const updatedGraph = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf-8'));
  const finalCount = updatedGraph.entities.length;
  const newEntitiesCount = finalCount - initialCount;

  console.log(`📊 Final entities in graph: ${finalCount}`);
  console.log(`✨ New entities created: ${newEntitiesCount}`);

  // Show the new entities
  if (newEntitiesCount > 0) {
    console.log('\n📝 New entities:');
    const newEntities = updatedGraph.entities.slice(initialCount);
    newEntities.forEach((entity: any) => {
      console.log(`  - ${entity.canonical} (${entity.type}) [ID: ${entity.id}]`);
    });
  }

  // Verify via GraphQL query
  console.log('\n🔎 Querying entities via GraphQL API...');

  const listEntitiesQuery = `
    query ListEntities($project: String!) {
      listEntities(project: $project, limit: 100) {
        nodes {
          id
          name
          types
        }
        totalApprox
      }
    }
  `;

  const result = await graphqlQuery(listEntitiesQuery, { project: PROJECT });

  console.log(`✅ API returned ${result.listEntities.totalApprox} total entities`);

  // Check if our specific entities are present
  const entityNames = result.listEntities.nodes.map((e: any) => e.name);
  const expectedEntities = ['Frodo', 'Shire', 'One Ring', 'Gandalf', 'Rivendell'];

  console.log('\n✅ Verification:');
  expectedEntities.forEach(name => {
    const found = entityNames.some((n: string) => n.toLowerCase().includes(name.toLowerCase()));
    console.log(`  ${found ? '✅' : '❌'} ${name}: ${found ? 'Found' : 'Not found'}`);
  });

  console.log('\n🎉 Test complete!');
  console.log('\n💡 You can now view these entities in the UI at:');
  console.log('   http://localhost:3002/#/home');
}

main().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
