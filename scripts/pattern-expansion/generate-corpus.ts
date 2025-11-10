/**
 * Synthetic Corpus Generator
 *
 * Generates test sentences with gold relation labels for evaluating pattern coverage.
 * Includes hard negatives and ambiguous cases.
 */

import * as fs from 'fs';
import * as path from 'path';

interface GoldRelation {
  subject: string;
  relation: string;
  object: string;
  qualifiers?: {
    time?: string;
    place?: string;
  };
}

interface TestCase {
  text: string;
  gold_relations: GoldRelation[];
  family: string;
  case_type: 'positive' | 'negative' | 'uncertain' | 'ambiguous';
}

/**
 * Template-based sentence generation for each family
 */
const FAMILY_TEMPLATES: Record<string, { positive: string[]; negative: string[]; uncertain: string[] }> = {
  kinship: {
    positive: [
      'Alice, daughter of Robert, studied medicine.',
      'Marcus married Elena in the spring.',
      'Thomas and James are siblings.',
      'Victoria is the mother of three children.',
      'Prince Edward, heir of Queen Elizabeth, attended the ceremony.',
      'Sofia, offspring of Marcus, excelled in her studies.',
      'King Arthur, descendant of Uther Pendragon, ruled the kingdom.',
      'Isabella is the sister of Ferdinand.',
      'Lord Byron married Lady Anne.',
      'Catherine and her brother William traveled together.'
    ],
    negative: [
      'Alice is not related to Robert.',
      'Marcus never married Elena.',
      'Thomas and James are not siblings.',
      'Victoria has no children.',
      'Edward is unrelated to the royal family.'
    ],
    uncertain: [
      'Alice is allegedly the daughter of Robert.',
      'Marcus possibly married Elena.',
      'Some claim Thomas and James are siblings.',
      'Victoria is rumored to be the mother of Edward.',
      'Reports suggest Isabella is related to Ferdinand.'
    ]
  },

  ownership: {
    positive: [
      'Rockefeller owns Standard Oil Company.',
      'The estate belongs to the Duke of Westminster.',
      'Microsoft possesses numerous patents.',
      'Tesla acquired SolarCity in 2016.',
      'The painting is the property of the Louvre Museum.',
      'Carnegie owned several steel mills.',
      'The land belongs to the government.',
      'Apple possesses the iPhone trademark.',
      'Musk owns Tesla and SpaceX.',
      'The book is the property of the library.'
    ],
    negative: [
      'Rockefeller does not own Standard Oil anymore.',
      'The estate no longer belongs to the Duke.',
      'Microsoft never possessed that patent.',
      'Tesla did not acquire SolarCity.',
      'The painting is not the property of the Louvre.'
    ],
    uncertain: [
      'Rockefeller allegedly owns the company.',
      'The estate reportedly belongs to the Duke.',
      'Microsoft possibly possesses the patent.',
      'Sources claim Tesla acquired SolarCity.',
      'The painting may be the property of the museum.'
    ]
  },

  employment: {
    positive: [
      'Sarah works for Google in Mountain View.',
      'Dr. Chen is employed by Stanford Hospital.',
      'Marcus is a member of the Board of Directors.',
      'Elena serves as Chief Technology Officer.',
      'Professor Smith teaches at Harvard University.',
      'John manages the Sales Department.',
      'Alice is affiliated with MIT.',
      'Robert leads the Engineering team.',
      'Victoria is a partner at Goldman Sachs.',
      'Thomas joined Microsoft in 2020.'
    ],
    negative: [
      'Sarah does not work for Google.',
      'Dr. Chen is not employed by Stanford.',
      'Marcus is not a member of the Board.',
      'Elena never served as CTO.',
      'Smith no longer teaches at Harvard.'
    ],
    uncertain: [
      'Sarah allegedly works for Google.',
      'Dr. Chen is reportedly employed by Stanford.',
      'Marcus is rumored to be a Board member.',
      'Sources say Elena serves as CTO.',
      'Smith possibly teaches at Harvard.'
    ]
  },

  creation: {
    positive: [
      'Leonardo da Vinci painted the Mona Lisa.',
      'Shakespeare wrote Hamlet.',
      'Einstein invented the theory of relativity.',
      'Mozart composed The Magic Flute.',
      'Frank Lloyd Wright designed Fallingwater.',
      'Tolkien authored The Lord of the Rings.',
      'Edison invented the light bulb.',
      'Picasso painted Guernica.',
      'Beethoven composed Symphony No. 9.',
      'Michelangelo sculpted David.'
    ],
    negative: [
      'Leonardo did not paint the Mona Lisa.',
      'Shakespeare never wrote Hamlet.',
      'Einstein did not invent relativity.',
      'Mozart never composed The Magic Flute.',
      'Wright did not design Fallingwater.'
    ],
    uncertain: [
      'Leonardo allegedly painted the Mona Lisa.',
      'Some scholars dispute Shakespeare wrote Hamlet.',
      'Einstein possibly invented the theory.',
      'Mozart reportedly composed the work.',
      'Wright may have designed the building.'
    ]
  },

  location: {
    positive: [
      'Paris is located in France.',
      'The Eiffel Tower stands in Paris.',
      'Silicon Valley is situated in California.',
      'The Pyramids are located at Giza.',
      'Harvard University is based in Cambridge.',
      'The Louvre is located in Paris.',
      'Tokyo is situated in Japan.',
      'The White House stands in Washington DC.',
      'Oxford is located near London.',
      'Venice is situated in Italy.'
    ],
    negative: [
      'Paris is not located in Germany.',
      'The Eiffel Tower does not stand in London.',
      'Silicon Valley is not in New York.',
      'The Pyramids are not at Cairo.',
      'Harvard is not based in Boston.'
    ],
    uncertain: [
      'The exact location is disputed.',
      'Paris is allegedly in France.',
      'The site possibly stands in that region.',
      'Reports place the building in that city.',
      'The location is uncertain.'
    ]
  },

  temporal: {
    positive: [
      'World War II occurred after World War I.',
      'The Renaissance followed the Middle Ages.',
      'Armstrong walked on the moon during 1969.',
      'The French Revolution began before the American Civil War.',
      'The Industrial Revolution happened after the Medieval period.',
      'Shakespeare lived during the Elizabethan era.',
      'The Great Depression occurred between 1929 and 1939.',
      'Columbus arrived in America before the Pilgrims.',
      'The Roman Empire existed before the Byzantine Empire.',
      'The Cold War ended after the Vietnam War.'
    ],
    negative: [
      'World War II did not occur before World War I.',
      'The Renaissance did not follow the Modern Age.',
      'Armstrong did not walk on the moon during 1970.',
      'The French Revolution did not begin after the Civil War.',
      'The Industrial Revolution did not happen before Rome.'
    ],
    uncertain: [
      'The exact date is disputed.',
      'The event possibly occurred in that period.',
      'Historians debate whether it happened before or after.',
      'The timeline is uncertain.',
      'Reports vary on when this occurred.'
    ]
  },

  causation: {
    positive: [
      'The drought caused the famine.',
      'Economic crisis led to political instability.',
      'Smoking resulted in lung disease.',
      'The invention triggered an industrial revolution.',
      'Climate change is caused by carbon emissions.',
      'The discovery led to new medical treatments.',
      'Poor planning resulted in project failure.',
      'The scandal caused the resignation.',
      'Innovation influenced market trends.',
      'The policy triggered public protests.'
    ],
    negative: [
      'The drought did not cause the famine.',
      'Economic crisis did not lead to stability.',
      'Smoking was not the cause of the disease.',
      'The invention did not trigger revolution.',
      'Climate change is not caused by emissions.'
    ],
    uncertain: [
      'The drought allegedly caused the famine.',
      'Economic crisis possibly led to instability.',
      'Smoking may have resulted in disease.',
      'The invention reportedly triggered change.',
      'The cause is disputed.'
    ]
  },

  part_whole: {
    positive: [
      'California is part of the United States.',
      'The engine is a component of the car.',
      'Manhattan is part of New York City.',
      'The chapter comprises ten sections.',
      'The team consists of twelve members.',
      'The wheel is part of the bicycle.',
      'The keyboard is a component of the computer.',
      'Alaska is part of the USA.',
      'The wing is part of the airplane.',
      'The lens comprises multiple elements.'
    ],
    negative: [
      'California is not part of Mexico.',
      'The engine is not a component of the plane.',
      'Manhattan is not part of Boston.',
      'The chapter does not comprise any sections.',
      'The team does not consist of members.'
    ],
    uncertain: [
      'California is allegedly part of the region.',
      'The component possibly comprises that part.',
      'Manhattan may be part of the greater area.',
      'The structure reportedly consists of elements.',
      'The composition is uncertain.'
    ]
  },

  identity: {
    positive: [
      'Mark Twain is Samuel Clemens.',
      'Beijing equals Peking.',
      'New York is also known as the Big Apple.',
      'H2O represents water.',
      'Churchill is the same person as Winston Leonard Spencer Churchill.',
      'The USA is America.',
      'Istanbul was formerly Constantinople.',
      'Myanmar is also known as Burma.',
      'The Netherlands is Holland.',
      'Mumbai was previously Bombay.'
    ],
    negative: [
      'Mark Twain is not Charles Dickens.',
      'Beijing does not equal Tokyo.',
      'New York is not Los Angeles.',
      'H2O does not represent alcohol.',
      'Churchill is not Roosevelt.'
    ],
    uncertain: [
      'Mark Twain is allegedly the same as Clemens.',
      'Beijing possibly equals that city.',
      'The name reportedly represents the entity.',
      'The identity is disputed.',
      'Sources disagree on the equivalence.'
    ]
  },

  event: {
    positive: [
      'Churchill attended the Yalta Conference.',
      'Mozart performed at the Vienna Opera.',
      'Armstrong participated in the Apollo 11 mission.',
      'Einstein attended the Solvay Conference.',
      'Shakespeare performed at the Globe Theatre.',
      'Roosevelt hosted the Teheran Conference.',
      'Picasso exhibited at the Paris Salon.',
      'Newton witnessed the Great Fire of London.',
      'Lincoln attended the Gettysburg ceremony.',
      'Gandhi organized the Salt March.'
    ],
    negative: [
      'Churchill did not attend the Potsdam Conference.',
      'Mozart never performed at that venue.',
      'Armstrong did not participate in Apollo 12.',
      'Einstein was absent from the conference.',
      'Shakespeare never performed at that theater.'
    ],
    uncertain: [
      'Churchill allegedly attended the conference.',
      'Mozart possibly performed at the opera.',
      'Armstrong reportedly participated in the mission.',
      'Sources claim Einstein attended.',
      'The attendance is disputed.'
    ]
  },

  communication: {
    positive: [
      'Lincoln wrote a letter to Grant.',
      'Einstein told Bohr about the theory.',
      'Churchill spoke to Roosevelt about strategy.',
      'Jefferson wrote to Adams regarding politics.',
      'King asked Congress for civil rights legislation.',
      'Darwin wrote to Wallace about evolution.',
      'Newton replied to Leibniz about calculus.',
      'Franklin informed Washington about developments.',
      'Marx wrote to Engels about economics.',
      'Galileo reported his findings to the Church.'
    ],
    negative: [
      'Lincoln did not write to Grant.',
      'Einstein never told Bohr about that.',
      'Churchill did not speak to Roosevelt.',
      'Jefferson never wrote to Adams.',
      'King did not ask Congress.'
    ],
    uncertain: [
      'Lincoln allegedly wrote to Grant.',
      'Einstein possibly told Bohr.',
      'Churchill reportedly spoke to Roosevelt.',
      'Sources claim Jefferson wrote to Adams.',
      'The communication is uncertain.'
    ]
  },

  power: {
    positive: [
      'Napoleon ruled France.',
      'Caesar commanded the Roman legions.',
      'Elizabeth II governed the United Kingdom.',
      'Alexander controlled the Greek empire.',
      'Genghis Khan dominated Central Asia.',
      'Augustus ruled Rome.',
      'Victoria governed the British Empire.',
      'Peter the Great controlled Russia.',
      'Charlemagne commanded the Frankish Empire.',
      'Akbar ruled the Mughal Empire.'
    ],
    negative: [
      'Napoleon did not rule Britain.',
      'Caesar never commanded the Greek army.',
      'Elizabeth did not govern France.',
      'Alexander never controlled Rome.',
      'Genghis Khan did not dominate Europe.'
    ],
    uncertain: [
      'Napoleon allegedly ruled that territory.',
      'Caesar possibly commanded those forces.',
      'Elizabeth reportedly governed the region.',
      'Sources claim Alexander controlled the area.',
      'The rule is disputed.'
    ]
  },

  comparison: {
    positive: [
      'Mount Everest is higher than K2.',
      'The Pacific Ocean is larger than the Atlantic.',
      'Gold is more valuable than silver.',
      'Light travels faster than sound.',
      'China has a greater population than India.',
      'Jupiter is larger than Saturn.',
      'The Nile is longer than the Amazon.',
      'Diamond is harder than quartz.',
      'Mercury is denser than water.',
      'Antarctica is colder than the Arctic.'
    ],
    negative: [
      'Everest is not higher than the sky.',
      'The Pacific is not smaller than a lake.',
      'Gold is not less valuable than iron.',
      'Light does not travel slower than sound.',
      'China does not have a smaller population.'
    ],
    uncertain: [
      'Everest is possibly higher than that peak.',
      'The ocean is allegedly larger.',
      'Gold may be more valuable.',
      'Reports suggest light travels faster.',
      'The comparison is disputed.'
    ]
  },

  emotional: {
    positive: [
      'Romeo loved Juliet.',
      'Brutus respected Caesar.',
      'Othello envied Cassio.',
      'Achilles admired Patroclus.',
      'Iago hated Othello.',
      'Hamlet feared his uncle.',
      'Elizabeth loved Darcy.',
      'Heathcliff despised Hindley.',
      'Jane Eyre admired Rochester.',
      'Scarlett envied Melanie.'
    ],
    negative: [
      'Romeo did not love Paris.',
      'Brutus never respected Anthony.',
      'Othello did not envy Desdemona.',
      'Achilles did not admire Hector.',
      'Iago did not hate Cassio.'
    ],
    uncertain: [
      'Romeo allegedly loved Juliet.',
      'Brutus possibly respected Caesar.',
      'Othello reportedly envied Cassio.',
      'Sources claim Achilles admired him.',
      'The emotion is uncertain.'
    ]
  },

  negation: {
    positive: [
      'Scientists denied the claim.',
      'The rumor was disputed by authorities.',
      'The allegation was not proven.',
      'Experts alleged fraud occurred.',
      'The report was uncertain about the link.',
      'The theory was denied by peers.',
      'The connection was disputed.',
      'The claim remains unverified.',
      'The relationship is alleged but unconfirmed.',
      'The evidence is inconclusive.'
    ],
    negative: [
      'Scientists confirmed the claim.',
      'The rumor was verified.',
      'The allegation was proven.',
      'No fraud occurred.',
      'The link is certain.'
    ],
    uncertain: [
      'The denial is itself disputed.',
      'Whether it was alleged is unclear.',
      'The uncertainty is uncertain.',
      'The rumor about the rumor is unverified.',
      'The meta-claim requires investigation.'
    ]
  }
};

/**
 * Generate synthetic corpus
 */
export async function generateCorpus(
  targetSize: number = 1500,
  negRatio: number = 0.2,
  uncertainRatio: number = 0.1
): Promise<TestCase[]> {
  const corpus: TestCase[] = [];
  const families = Object.keys(FAMILY_TEMPLATES);

  const perFamily = Math.ceil(targetSize / families.length);
  const negPerFamily = Math.floor(perFamily * negRatio);
  const uncertainPerFamily = Math.floor(perFamily * uncertainRatio);
  const posPerFamily = perFamily - negPerFamily - uncertainPerFamily;

  console.log(`\n=== Generating Synthetic Corpus ===`);
  console.log(`Target size: ${targetSize}`);
  console.log(`Per family: ${perFamily} (${posPerFamily} pos, ${negPerFamily} neg, ${uncertainPerFamily} uncertain)\n`);

  for (const family of families) {
    const templates = FAMILY_TEMPLATES[family];

    // Add positive cases
    for (let i = 0; i < posPerFamily && i < templates.positive.length; i++) {
      const text = templates.positive[i];
      corpus.push({
        text,
        gold_relations: extractGoldRelations(text, family, 'positive'),
        family,
        case_type: 'positive'
      });
    }

    // Add negative cases
    for (let i = 0; i < negPerFamily && i < templates.negative.length; i++) {
      const text = templates.negative[i];
      corpus.push({
        text,
        gold_relations: [],  // No relations in negative cases
        family,
        case_type: 'negative'
      });
    }

    // Add uncertain cases
    for (let i = 0; i < uncertainPerFamily && i < templates.uncertain.length; i++) {
      const text = templates.uncertain[i];
      corpus.push({
        text,
        gold_relations: extractGoldRelations(text, family, 'uncertain'),
        family,
        case_type: 'uncertain'
      });
    }

    console.log(`${family}: ${posPerFamily + negPerFamily + uncertainPerFamily} cases`);
  }

  console.log(`\n✓ Generated ${corpus.length} test cases`);
  return corpus;
}

/**
 * Extract gold relations from template text (simplified extraction)
 */
function extractGoldRelations(text: string, family: string, caseType: string): GoldRelation[] {
  // This is a simplified implementation
  // In a real system, you'd manually annotate or use more sophisticated parsing

  const relations: GoldRelation[] = [];

  // Extract proper nouns as potential entities
  const entities = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];

  if (entities.length >= 2 && caseType === 'positive') {
    // Create a relation between first two entities
    relations.push({
      subject: entities[0],
      relation: inferRelation(text, family),
      object: entities[1]
    });
  }

  return relations;
}

/**
 * Infer relation predicate from text and family
 */
function inferRelation(text: string, family: string): string {
  const predicateMap: Record<string, string> = {
    kinship: text.includes('daughter') ? 'child_of' :
             text.includes('married') ? 'married_to' :
             text.includes('sibling') ? 'sibling_of' :
             text.includes('mother') ? 'parent_of' : 'related_to',

    ownership: text.includes('owns') ? 'owns' :
               text.includes('belongs') ? 'belongs_to' :
               text.includes('property') ? 'property_of' : 'possesses',

    employment: text.includes('works') ? 'works_for' :
                text.includes('employed') ? 'employed_by' :
                text.includes('member') ? 'member_of' : 'affiliated_with',

    creation: text.includes('painted') ? 'painted_by' :
              text.includes('wrote') ? 'written_by' :
              text.includes('invented') ? 'invented_by' :
              text.includes('composed') ? 'composed_by' : 'created_by',

    location: 'located_in',
    temporal: 'after',
    causation: 'caused_by',
    part_whole: 'part_of',
    identity: 'is',
    event: 'attended',
    communication: 'wrote_to',
    power: 'ruled',
    comparison: 'greater_than',
    emotional: 'loved',
    negation: 'denied'
  };

  return predicateMap[family] || 'unknown';
}

/**
 * Save corpus to JSONL format
 */
export async function saveCorpus(corpus: TestCase[]): Promise<void> {
  const outputDir = path.join(process.cwd(), 'corpora');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'synthetic_all_relations.jsonl');
  const lines = corpus.map(tc => JSON.stringify(tc)).join('\n');

  fs.writeFileSync(outputPath, lines);

  console.log(`\n✓ Saved corpus to ${outputPath}`);
  console.log(`✓ Total test cases: ${corpus.length}`);
}

// Main execution
if (require.main === module) {
  generateCorpus()
    .then(saveCorpus)
    .then(() => console.log('\n✓ Corpus generation complete!\n'))
    .catch(console.error);
}
