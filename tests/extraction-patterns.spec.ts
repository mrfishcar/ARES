/**
 * Extraction Pattern Tests
 *
 * Tests extraction patterns directly without requiring BookNLP.
 * Uses extractAllNarrativeRelations and pattern matching.
 */

import { describe, it, expect } from 'vitest';
import { extractAllNarrativeRelations } from '../app/engine/narrative-relations';
import type { Relation } from '../app/engine/schema';

// Helper to create test entities
function makeEntity(id: string, name: string, type: 'PERSON' | 'ORG' | 'PLACE' = 'PERSON', aliases: string[] = []) {
  return { id, canonical: name, type, aliases };
}

// Helper to check if relation exists
function hasRelation(relations: Relation[], pred: string, subjId: string, objId: string): boolean {
  return relations.some(r => r.pred === pred && r.subj === subjId && r.obj === objId);
}

describe('Narrative Relation Extraction Patterns', () => {

  describe('Sibling Patterns', () => {
    it('should extract sibling_of from "X\'s brother Y" pattern', () => {
      const text = `Edward's brother, Edmund, was waiting.`;
      const entities = [
        makeEntity('e1', 'Edward'),
        makeEntity('e2', 'Edmund'),
      ];

      const relations = extractAllNarrativeRelations(text, entities, 'test');

      expect(hasRelation(relations, 'sibling_of', 'e1', 'e2')).toBe(true);
      expect(hasRelation(relations, 'sibling_of', 'e2', 'e1')).toBe(true);
    });

    it('should extract sibling_of from "X\'s sister Y" pattern', () => {
      const text = `Sarah's sister, Emily, arrived.`;
      const entities = [
        makeEntity('e1', 'Sarah'),
        makeEntity('e2', 'Emily'),
      ];

      const relations = extractAllNarrativeRelations(text, entities, 'test');

      expect(hasRelation(relations, 'sibling_of', 'e1', 'e2')).toBe(true);
    });

    it('should handle multi-word names with sibling pattern', () => {
      const text = `John Smith's brother, Michael Smith, was there.`;
      const entities = [
        makeEntity('e1', 'John Smith', 'PERSON', ['John']),
        makeEntity('e2', 'Michael Smith', 'PERSON', ['Michael']),
      ];

      const relations = extractAllNarrativeRelations(text, entities, 'test');

      expect(hasRelation(relations, 'sibling_of', 'e1', 'e2')).toBe(true);
    });
  });

  describe('Parent-Child Patterns', () => {
    it('should extract parent_of from "X\'s son Y" pattern', () => {
      const text = `Robert's son, James, inherited the estate.`;
      const entities = [
        makeEntity('e1', 'Robert'),
        makeEntity('e2', 'James'),
      ];

      const relations = extractAllNarrativeRelations(text, entities, 'test');

      expect(hasRelation(relations, 'parent_of', 'e1', 'e2')).toBe(true);
    });

    it('should extract parent_of from "X\'s daughter Y" pattern', () => {
      const text = `Mary's daughter, Elizabeth, was born in spring.`;
      const entities = [
        makeEntity('e1', 'Mary'),
        makeEntity('e2', 'Elizabeth'),
      ];

      const relations = extractAllNarrativeRelations(text, entities, 'test');

      expect(hasRelation(relations, 'parent_of', 'e1', 'e2')).toBe(true);
    });

    it('should extract child_of from "X\'s father Y" pattern', () => {
      const text = `Thomas's father, William, was a farmer.`;
      const entities = [
        makeEntity('e1', 'Thomas'),
        makeEntity('e2', 'William'),
      ];

      const relations = extractAllNarrativeRelations(text, entities, 'test');

      expect(hasRelation(relations, 'child_of', 'e1', 'e2')).toBe(true);
    });

    it('should extract child_of from "X\'s mother Y" pattern', () => {
      const text = `Anna's mother, Catherine, taught her to read.`;
      const entities = [
        makeEntity('e1', 'Anna'),
        makeEntity('e2', 'Catherine'),
      ];

      const relations = extractAllNarrativeRelations(text, entities, 'test');

      expect(hasRelation(relations, 'child_of', 'e1', 'e2')).toBe(true);
    });
  });

  describe('Marriage Patterns', () => {
    it('should extract married_to from "X\'s wife Y" pattern', () => {
      const text = `John's wife, Sarah, prepared dinner.`;
      const entities = [
        makeEntity('e1', 'John'),
        makeEntity('e2', 'Sarah'),
      ];

      const relations = extractAllNarrativeRelations(text, entities, 'test');

      expect(hasRelation(relations, 'married_to', 'e1', 'e2')).toBe(true);
    });

    it('should extract married_to from "X\'s husband Y" pattern', () => {
      const text = `Mary's husband, Peter, worked at the mill.`;
      const entities = [
        makeEntity('e1', 'Mary'),
        makeEntity('e2', 'Peter'),
      ];

      const relations = extractAllNarrativeRelations(text, entities, 'test');

      expect(hasRelation(relations, 'married_to', 'e1', 'e2')).toBe(true);
    });

    it('should extract married_to from "X married Y" pattern', () => {
      const text = `Edward married Margaret in the spring.`;
      const entities = [
        makeEntity('e1', 'Edward'),
        makeEntity('e2', 'Margaret'),
      ];

      const relations = extractAllNarrativeRelations(text, entities, 'test');

      expect(hasRelation(relations, 'married_to', 'e1', 'e2') ||
             hasRelation(relations, 'married_to', 'e2', 'e1')).toBe(true);
    });
  });

  describe('Kinship with Adjectives', () => {
    it('should extract sibling_of with adjective "younger brother"', () => {
      const text = `Thomas's younger brother, Henry, was mischievous.`;
      const entities = [
        makeEntity('e1', 'Thomas'),
        makeEntity('e2', 'Henry'),
      ];

      const relations = extractAllNarrativeRelations(text, entities, 'test');

      expect(hasRelation(relations, 'sibling_of', 'e1', 'e2')).toBe(true);
    });

    it('should extract sibling_of with adjective "elder sister"', () => {
      const text = `Jane's elder sister, Charlotte, was strict.`;
      const entities = [
        makeEntity('e1', 'Jane'),
        makeEntity('e2', 'Charlotte'),
      ];

      const relations = extractAllNarrativeRelations(text, entities, 'test');

      expect(hasRelation(relations, 'sibling_of', 'e1', 'e2')).toBe(true);
    });

    it('should extract child_of with adjective "late father"', () => {
      const text = `Margaret's late father, George, was a merchant.`;
      const entities = [
        makeEntity('e1', 'Margaret'),
        makeEntity('e2', 'George'),
      ];

      const relations = extractAllNarrativeRelations(text, entities, 'test');

      expect(hasRelation(relations, 'child_of', 'e1', 'e2')).toBe(true);
    });
  });

  describe('Complex Sentences', () => {
    it('should extract from appositive construction', () => {
      const text = `Edward, the son of Lord Richard, claimed the throne.`;
      const entities = [
        makeEntity('e1', 'Edward'),
        makeEntity('e2', 'Lord Richard', 'PERSON', ['Richard']),
      ];

      const relations = extractAllNarrativeRelations(text, entities, 'test');

      // Pattern "X, son of Y" creates parent_of(Y, X) or child_of(X, Y)
      const hasRelationship = hasRelation(relations, 'child_of', 'e1', 'e2') ||
                              hasRelation(relations, 'parent_of', 'e2', 'e1');
      expect(hasRelationship).toBe(true);
    });

    it('should extract from multiple family mentions in one sentence', () => {
      const text = `Arthur's father, Uther, and his mother, Igraine, ruled the kingdom.`;
      const entities = [
        makeEntity('e1', 'Arthur'),
        makeEntity('e2', 'Uther'),
        makeEntity('e3', 'Igraine'),
      ];

      const relations = extractAllNarrativeRelations(text, entities, 'test');

      expect(hasRelation(relations, 'child_of', 'e1', 'e2')).toBe(true);
      // Note: "his mother, Igraine" uses pronoun - may not resolve without coref
    });
  });

  describe('Edge Cases', () => {
    it('should not create self-referential relations', () => {
      const text = `John's brother John arrived.`;
      const entities = [
        makeEntity('e1', 'John'),
      ];

      const relations = extractAllNarrativeRelations(text, entities, 'test');

      const selfRef = relations.some(r => r.subj === r.obj);
      expect(selfRef).toBe(false);
    });

    it('should handle names with titles', () => {
      const text = `Lord Edward's daughter, Lady Anne, was beautiful.`;
      const entities = [
        makeEntity('e1', 'Lord Edward', 'PERSON', ['Edward']),
        makeEntity('e2', 'Lady Anne', 'PERSON', ['Anne']),
      ];

      const relations = extractAllNarrativeRelations(text, entities, 'test');

      expect(hasRelation(relations, 'parent_of', 'e1', 'e2')).toBe(true);
    });
  });
});

describe('Descendant/Heir/Offspring Patterns', () => {
  it('should extract child_of from "X, descendant of Y" pattern', () => {
    const text = `Arthur, descendant of Uther, claimed his birthright.`;
    const entities = [
      makeEntity('e1', 'Arthur'),
      makeEntity('e2', 'Uther'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    // Either child_of or some descendant relation should exist
    const hasDescendant = relations.some(r =>
      (r.pred === 'child_of' || r.pred === 'descendant_of') &&
      r.subj === 'e1' && r.obj === 'e2'
    );
    expect(hasDescendant).toBe(true);
  });

  it('should extract child_of from "X was a descendant of Y" pattern', () => {
    const text = `Henry was a descendant of William the Conqueror.`;
    const entities = [
      makeEntity('e1', 'Henry'),
      makeEntity('e2', 'William the Conqueror', 'PERSON', ['William']),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    const hasDescendant = relations.some(r =>
      (r.pred === 'child_of' || r.pred === 'descendant_of') &&
      r.subj === 'e1' && r.obj === 'e2'
    );
    expect(hasDescendant).toBe(true);
  });

  it('should extract child_of from "X, heir of Y" pattern', () => {
    const text = `Edward, heir of King Richard, awaited coronation.`;
    const entities = [
      makeEntity('e1', 'Edward'),
      makeEntity('e2', 'King Richard', 'PERSON', ['Richard']),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    const hasHeir = relations.some(r =>
      (r.pred === 'child_of' || r.pred === 'heir_of') &&
      r.subj === 'e1' && r.obj === 'e2'
    );
    expect(hasHeir).toBe(true);
  });
});

describe('Employment/Membership Patterns', () => {
  it('should extract works_at from "X works at Y" pattern', () => {
    const text = `Sarah works at Google.`;
    const entities = [
      makeEntity('e1', 'Sarah'),
      makeEntity('e2', 'Google', 'ORG'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    const worksAt = relations.some(r =>
      (r.pred === 'works_at' || r.pred === 'employed_by' || r.pred === 'member_of') &&
      r.subj === 'e1' && r.obj === 'e2'
    );
    expect(worksAt).toBe(true);
  });

  it('should extract leads from "X founded Y" pattern', () => {
    const text = `Steve Jobs founded Apple.`;
    const entities = [
      makeEntity('e1', 'Steve Jobs', 'PERSON', ['Steve']),
      makeEntity('e2', 'Apple', 'ORG'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    const founded = relations.some(r =>
      (r.pred === 'founded' || r.pred === 'leads' || r.pred === 'founded_by') &&
      (r.subj === 'e1' || r.obj === 'e1')
    );
    expect(founded).toBe(true);
  });
});

describe('Birth/Origin Patterns', () => {
  it('should extract born_in from "X was born in Y" pattern', () => {
    const text = `John was born in London.`;
    const entities = [
      makeEntity('e1', 'John'),
      makeEntity('e2', 'London', 'PLACE'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'born_in', 'e1', 'e2')).toBe(true);
  });

  it('should extract born_in from appositive "X, born in Y" pattern', () => {
    const text = `Shakespeare, born in Stratford, became famous.`;
    const entities = [
      makeEntity('e1', 'Shakespeare'),
      makeEntity('e2', 'Stratford', 'PLACE'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'born_in', 'e1', 'e2')).toBe(true);
  });

  it('should extract born_in from "X hails from Y" pattern', () => {
    const text = `Arthur hails from Camelot.`;
    const entities = [
      makeEntity('e1', 'Arthur'),
      makeEntity('e2', 'Camelot', 'PLACE'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'born_in', 'e1', 'e2')).toBe(true);
  });
});

describe('Violence/Conflict Patterns', () => {
  it('should extract killed from "X killed Y" pattern', () => {
    const text = `Thomas killed Richard.`;
    const entities = [
      makeEntity('e1', 'Thomas'),
      makeEntity('e2', 'Richard'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'killed', 'e1', 'e2')).toBe(true);
  });

  it('should extract killed from passive "X was killed by Y" pattern', () => {
    const text = `Richard was killed by Thomas.`;
    const entities = [
      makeEntity('e1', 'Richard'),
      makeEntity('e2', 'Thomas'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'killed', 'e2', 'e1')).toBe(true);
  });

  it('should extract defeated from "X defeated Y" pattern', () => {
    const text = `Arthur defeated Mordred.`;
    const entities = [
      makeEntity('e1', 'Arthur'),
      makeEntity('e2', 'Mordred'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'defeated', 'e1', 'e2')).toBe(true);
  });
});

describe('Emotional/Interpersonal Patterns', () => {
  it('should extract loves from "X loves Y" pattern', () => {
    const text = `Sarah loves Michael.`;
    const entities = [
      makeEntity('e1', 'Sarah'),
      makeEntity('e2', 'Michael'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'loves', 'e1', 'e2')).toBe(true);
  });

  it('should extract hates from "X hates Y" pattern', () => {
    const text = `Alice hates Bob.`;
    const entities = [
      makeEntity('e1', 'Alice'),
      makeEntity('e2', 'Bob'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'hates', 'e1', 'e2')).toBe(true);
  });

  it('should extract friends_with from "X is a friend of Y" pattern', () => {
    const text = `Peter is a friend of Paul.`;
    const entities = [
      makeEntity('e1', 'Peter'),
      makeEntity('e2', 'Paul'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'friends_with', 'e1', 'e2') ||
           hasRelation(relations, 'friends_with', 'e2', 'e1')).toBe(true);
  });

  it('should extract trusts from "X trusts Y" pattern', () => {
    const text = `Harry trusts Dumbledore.`;
    const entities = [
      makeEntity('e1', 'Harry'),
      makeEntity('e2', 'Dumbledore'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'trusts', 'e1', 'e2')).toBe(true);
  });

  it('should extract fears from "X fears Y" pattern', () => {
    const text = `Frodo fears Sauron.`;
    const entities = [
      makeEntity('e1', 'Frodo'),
      makeEntity('e2', 'Sauron'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'fears', 'e1', 'e2')).toBe(true);
  });
});

describe('Betrayal/Deception Patterns', () => {
  it('should extract betrayed from "X betrayed Y" pattern', () => {
    const text = `David betrayed Jonathan.`;
    const entities = [
      makeEntity('e1', 'David'),
      makeEntity('e2', 'Jonathan'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'betrayed', 'e1', 'e2')).toBe(true);
  });

  it('should extract betrayed from passive "X was betrayed by Y" pattern', () => {
    const text = `Caesar was betrayed by Brutus.`;
    const entities = [
      makeEntity('e1', 'Caesar'),
      makeEntity('e2', 'Brutus'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'betrayed', 'e2', 'e1')).toBe(true);
  });
});

describe('Mentorship/Teaching Patterns', () => {
  it('should extract taught from "X taught Y" pattern', () => {
    const text = `James taught William.`;
    const entities = [
      makeEntity('e1', 'James'),
      makeEntity('e2', 'William'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'taught', 'e1', 'e2')).toBe(true);
  });

  it('should extract student_of from "X studied under Y" pattern', () => {
    const text = `Paul studied under Aristotle.`;
    const entities = [
      makeEntity('e1', 'Paul'),
      makeEntity('e2', 'Aristotle'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'student_of', 'e1', 'e2')).toBe(true);
  });

  it('should extract mentor_of from "X is the mentor of Y" pattern', () => {
    const text = `Gandalf is the mentor of Frodo.`;
    const entities = [
      makeEntity('e1', 'Gandalf'),
      makeEntity('e2', 'Frodo'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'mentor_of', 'e1', 'e2')).toBe(true);
  });
});

describe('Assistance/Cooperation Patterns', () => {
  it('should extract helped from "X helped Y" pattern', () => {
    const text = `Harry helped Hagrid.`;
    const entities = [
      makeEntity('e1', 'Harry'),
      makeEntity('e2', 'Hagrid'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'helped', 'e1', 'e2')).toBe(true);
  });

  it('should extract saved from "X saved Y" pattern', () => {
    const text = `Gandalf saved Frodo.`;
    const entities = [
      makeEntity('e1', 'Gandalf'),
      makeEntity('e2', 'Frodo'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'saved', 'e1', 'e2')).toBe(true);
  });
});

describe('Allegiance/Loyalty Patterns', () => {
  it('should extract serves from "X served Y" pattern', () => {
    const text = `Samwise served Frodo.`;
    const entities = [
      makeEntity('e1', 'Samwise'),
      makeEntity('e2', 'Frodo'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'serves', 'e1', 'e2')).toBe(true);
  });

  it('should extract loyal_to from "X is loyal to Y" pattern', () => {
    const text = `Legolas is loyal to Aragorn.`;
    const entities = [
      makeEntity('e1', 'Legolas'),
      makeEntity('e2', 'Aragorn'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'loyal_to', 'e1', 'e2')).toBe(true);
  });
});

describe('Communication Patterns', () => {
  it('should extract met from "X met Y" pattern', () => {
    const text = `Frodo met Gandalf.`;
    const entities = [
      makeEntity('e1', 'Frodo'),
      makeEntity('e2', 'Gandalf'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'met', 'e1', 'e2')).toBe(true);
  });

  it('should extract told from "X told Y" pattern', () => {
    const text = `Gandalf told Frodo.`;
    const entities = [
      makeEntity('e1', 'Gandalf'),
      makeEntity('e2', 'Frodo'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'told', 'e1', 'e2')).toBe(true);
  });

  it('should extract warned from "X warned Y" pattern', () => {
    const text = `Gandalf warned Frodo.`;
    const entities = [
      makeEntity('e1', 'Gandalf'),
      makeEntity('e2', 'Frodo'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'warned', 'e1', 'e2')).toBe(true);
  });

  it('should extract asked from "X asked Y" pattern', () => {
    const text = `Alice asked Bob.`;
    const entities = [
      makeEntity('e1', 'Alice'),
      makeEntity('e2', 'Bob'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'asked', 'e1', 'e2')).toBe(true);
  });

  it('should extract promised from "X promised Y" pattern', () => {
    const text = `John promised Mary.`;
    const entities = [
      makeEntity('e1', 'John'),
      makeEntity('e2', 'Mary'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'promised', 'e1', 'e2')).toBe(true);
  });

  it('should extract summoned from "X summoned Y" pattern', () => {
    const text = `Dumbledore summoned Harry.`;
    const entities = [
      makeEntity('e1', 'Dumbledore'),
      makeEntity('e2', 'Harry'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'summoned', 'e1', 'e2')).toBe(true);
  });

  it('should extract commanded from "X commanded Y" pattern', () => {
    const text = `Caesar commanded Brutus.`;
    const entities = [
      makeEntity('e1', 'Caesar'),
      makeEntity('e2', 'Brutus'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'commanded', 'e1', 'e2')).toBe(true);
  });
});

describe('Temporal Patterns', () => {
  it('should extract outlived from "X outlived Y" pattern', () => {
    const text = `Elizabeth outlived Philip.`;
    const entities = [
      makeEntity('e1', 'Elizabeth'),
      makeEntity('e2', 'Philip'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'outlived', 'e1', 'e2')).toBe(true);
  });
});

describe('Causation Patterns', () => {
  it('should extract caused from "X caused Y" pattern', () => {
    const text = `Marcus caused Chaos.`;
    const entities = [
      makeEntity('e1', 'Marcus'),
      makeEntity('e2', 'Chaos', 'PERSON'), // Treating as person for pattern test
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'caused', 'e1', 'e2')).toBe(true);
  });

  it('should extract prevented from "X prevented Y" pattern', () => {
    const text = `Harry prevented Voldemort.`;
    const entities = [
      makeEntity('e1', 'Harry'),
      makeEntity('e2', 'Voldemort'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'prevented', 'e1', 'e2')).toBe(true);
  });

  it('should extract stopped from "X stopped Y" pattern', () => {
    const text = `Gandalf stopped Balrog.`;
    const entities = [
      makeEntity('e1', 'Gandalf'),
      makeEntity('e2', 'Balrog'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'stopped', 'e1', 'e2')).toBe(true);
  });
});

describe('Transfer/Exchange Patterns', () => {
  it('should extract gave_to from "X gave to Y" pattern', () => {
    const text = `Bilbo gave the ring to Frodo.`;
    const entities = [
      makeEntity('e1', 'Bilbo'),
      makeEntity('e2', 'Frodo'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'gave_to', 'e1', 'e2')).toBe(true);
  });

  it('should extract stole_from from "X stole from Y" pattern', () => {
    const text = `Gollum stole the ring from Frodo.`;
    const entities = [
      makeEntity('e1', 'Gollum'),
      makeEntity('e2', 'Frodo'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'stole_from', 'e1', 'e2')).toBe(true);
  });

  it('should extract sent_to from "X sent to Y" pattern', () => {
    const text = `Elrond sent a message to Gandalf.`;
    const entities = [
      makeEntity('e1', 'Elrond'),
      makeEntity('e2', 'Gandalf'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'sent_to', 'e1', 'e2')).toBe(true);
  });
});

describe('Perception/Witness Patterns', () => {
  it('should extract saw from "X saw Y" pattern', () => {
    const text = `Frodo saw Galadriel.`;
    const entities = [
      makeEntity('e1', 'Frodo'),
      makeEntity('e2', 'Galadriel'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'saw', 'e1', 'e2')).toBe(true);
  });

  it('should extract witnessed from "X witnessed Y" pattern', () => {
    const text = `Sam witnessed Gollum.`;
    const entities = [
      makeEntity('e1', 'Sam'),
      makeEntity('e2', 'Gollum'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'witnessed', 'e1', 'e2')).toBe(true);
  });

  it('should extract recognized from "X recognized Y" pattern', () => {
    const text = `Bilbo recognized Gandalf.`;
    const entities = [
      makeEntity('e1', 'Bilbo'),
      makeEntity('e2', 'Gandalf'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'recognized', 'e1', 'e2')).toBe(true);
  });
});

describe('Competition/Contest Patterns', () => {
  it('should extract challenged from "X challenged Y" pattern', () => {
    const text = `Boromir challenged Aragorn.`;
    const entities = [
      makeEntity('e1', 'Boromir'),
      makeEntity('e2', 'Aragorn'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'challenged', 'e1', 'e2')).toBe(true);
  });

  it('should extract beat from "X beat Y" pattern', () => {
    const text = `Gandalf beat Saruman.`;
    const entities = [
      makeEntity('e1', 'Gandalf'),
      makeEntity('e2', 'Saruman'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'beat', 'e1', 'e2')).toBe(true);
  });

  it('should extract lost_to from "X lost to Y" pattern', () => {
    const text = `Sauron lost to Isildur.`;
    const entities = [
      makeEntity('e1', 'Sauron'),
      makeEntity('e2', 'Isildur'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'lost_to', 'e1', 'e2')).toBe(true);
  });
});

describe('Assistance/Support Patterns', () => {
  it('should extract assisted from "X assisted Y" pattern', () => {
    const text = `Legolas assisted Gimli.`;
    const entities = [
      makeEntity('e1', 'Legolas'),
      makeEntity('e2', 'Gimli'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'assisted', 'e1', 'e2')).toBe(true);
  });

  it('should extract supported from "X supported Y" pattern', () => {
    const text = `Aragorn supported Frodo.`;
    const entities = [
      makeEntity('e1', 'Aragorn'),
      makeEntity('e2', 'Frodo'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'supported', 'e1', 'e2')).toBe(true);
  });

  it('should extract endorsed from "X endorsed Y" pattern', () => {
    const text = `Elrond endorsed Aragorn.`;
    const entities = [
      makeEntity('e1', 'Elrond'),
      makeEntity('e2', 'Aragorn'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'endorsed', 'e1', 'e2')).toBe(true);
  });

  it('should extract funded from "X funded Y" pattern', () => {
    const text = `Thorin funded Bilbo.`;
    const entities = [
      makeEntity('e1', 'Thorin'),
      makeEntity('e2', 'Bilbo'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'funded', 'e1', 'e2')).toBe(true);
  });
});

describe('Transformation Patterns', () => {
  it('should extract replaced from "X replaced Y" pattern', () => {
    const text = `Faramir replaced Boromir.`;
    const entities = [
      makeEntity('e1', 'Faramir'),
      makeEntity('e2', 'Boromir'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'replaced', 'e1', 'e2')).toBe(true);
  });

  it('should extract overthrew from "X overthrew Y" pattern', () => {
    const text = `Sauron overthrew Morgoth.`;
    const entities = [
      makeEntity('e1', 'Sauron'),
      makeEntity('e2', 'Morgoth'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'overthrew', 'e1', 'e2')).toBe(true);
  });

  it('should extract joined from "X joined Y" pattern', () => {
    const text = `Pippin joined Gandalf.`;
    const entities = [
      makeEntity('e1', 'Pippin'),
      makeEntity('e2', 'Gandalf'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'joined', 'e1', 'e2')).toBe(true);
  });
});

describe('Knowledge/Belief Patterns', () => {
  it('should extract knows from "X knows Y" pattern', () => {
    const text = `Gandalf knows Saruman.`;
    const entities = [
      makeEntity('e1', 'Gandalf'),
      makeEntity('e2', 'Saruman'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'knows', 'e1', 'e2')).toBe(true);
  });

  it('should extract remembered from "X remembered Y" pattern', () => {
    const text = `Frodo remembered Gandalf.`;
    const entities = [
      makeEntity('e1', 'Frodo'),
      makeEntity('e2', 'Gandalf'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'remembered', 'e1', 'e2')).toBe(true);
  });

  it('should extract forgot from "X forgot Y" pattern', () => {
    const text = `Bilbo forgot Gollum.`;
    const entities = [
      makeEntity('e1', 'Bilbo'),
      makeEntity('e2', 'Gollum'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'forgot', 'e1', 'e2')).toBe(true);
  });

  it('should extract doubted from "X doubted Y" pattern', () => {
    const text = `Denethor doubted Faramir.`;
    const entities = [
      makeEntity('e1', 'Denethor'),
      makeEntity('e2', 'Faramir'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'doubted', 'e1', 'e2')).toBe(true);
  });
});

describe('Passive Voice Patterns', () => {
  it('should extract defeated from "X was defeated by Y" pattern', () => {
    const text = `Sauron was defeated by Isildur.`;
    const entities = [
      makeEntity('e1', 'Sauron'),
      makeEntity('e2', 'Isildur'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    // Y defeated X → Isildur defeated Sauron
    expect(hasRelation(relations, 'defeated', 'e2', 'e1')).toBe(true);
  });

  it('should extract saved from "X was saved by Y" pattern', () => {
    const text = `Frodo was saved by Sam.`;
    const entities = [
      makeEntity('e1', 'Frodo'),
      makeEntity('e2', 'Sam'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    // Sam saved Frodo
    expect(hasRelation(relations, 'saved', 'e2', 'e1')).toBe(true);
  });

  it('should extract raised from "X was raised by Y" pattern', () => {
    const text = `Harry was raised by Vernon.`;
    const entities = [
      makeEntity('e1', 'Harry'),
      makeEntity('e2', 'Vernon'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    // Vernon raised Harry
    expect(hasRelation(relations, 'raised', 'e2', 'e1')).toBe(true);
  });

  it('should extract inspired from "X was inspired by Y" pattern', () => {
    const text = `Faramir was inspired by Gandalf.`;
    const entities = [
      makeEntity('e1', 'Faramir'),
      makeEntity('e2', 'Gandalf'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    // Gandalf inspired Faramir
    expect(hasRelation(relations, 'inspired', 'e2', 'e1')).toBe(true);
  });

  it('should extract overthrew from "X was overthrown by Y" pattern', () => {
    const text = `Saruman was overthrown by Gandalf.`;
    const entities = [
      makeEntity('e1', 'Saruman'),
      makeEntity('e2', 'Gandalf'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    // Gandalf overthrew Saruman
    expect(hasRelation(relations, 'overthrew', 'e2', 'e1')).toBe(true);
  });
});

describe('Relational Adjective Patterns', () => {
  it('should extract devoted_to from "X was devoted to Y" pattern', () => {
    const text = `Sam was devoted to Frodo.`;
    const entities = [
      makeEntity('e1', 'Sam'),
      makeEntity('e2', 'Frodo'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'devoted_to', 'e1', 'e2')).toBe(true);
  });

  it('should extract hostile_to from "X was hostile to Y" pattern', () => {
    const text = `Sauron was hostile to Gandalf.`;
    const entities = [
      makeEntity('e1', 'Sauron'),
      makeEntity('e2', 'Gandalf'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'hostile_to', 'e1', 'e2')).toBe(true);
  });

  it('should extract jealous_of from "X was jealous of Y" pattern', () => {
    const text = `Boromir was jealous of Aragorn.`;
    const entities = [
      makeEntity('e1', 'Boromir'),
      makeEntity('e2', 'Aragorn'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'jealous_of', 'e1', 'e2')).toBe(true);
  });

  it('should extract fears from "X was afraid of Y" pattern', () => {
    const text = `Pippin was afraid of Denethor.`;
    const entities = [
      makeEntity('e1', 'Pippin'),
      makeEntity('e2', 'Denethor'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'fears', 'e1', 'e2')).toBe(true);
  });

  it('should extract grateful_to from "X was grateful to Y" pattern', () => {
    const text = `Frodo was grateful to Galadriel.`;
    const entities = [
      makeEntity('e1', 'Frodo'),
      makeEntity('e2', 'Galadriel'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'grateful_to', 'e1', 'e2')).toBe(true);
  });

  it('should extract related_to from "X is related to Y" pattern', () => {
    const text = `Faramir is related to Boromir.`;
    const entities = [
      makeEntity('e1', 'Faramir'),
      makeEntity('e2', 'Boromir'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'related_to', 'e1', 'e2')).toBe(true);
  });

  it('should extract loves from "X fell in love with Y" pattern', () => {
    const text = `Aragorn fell in love with Arwen.`;
    const entities = [
      makeEntity('e1', 'Aragorn'),
      makeEntity('e2', 'Arwen'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'loves', 'e1', 'e2')).toBe(true);
  });

  it('should extract close_to from "X grew close to Y" pattern', () => {
    const text = `Legolas grew close to Gimli.`;
    const entities = [
      makeEntity('e1', 'Legolas'),
      makeEntity('e2', 'Gimli'),
    ];

    const relations = extractAllNarrativeRelations(text, entities, 'test');

    expect(hasRelation(relations, 'close_to', 'e1', 'e2')).toBe(true);
  });
});
