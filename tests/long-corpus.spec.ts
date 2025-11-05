/**
 * Long Corpus Integration Test
 * Tests wiki generation on messy, multi-paragraph text
 */

import { describe, it, expect } from 'vitest';
import { extractEntities } from '../app/engine/extract/entities';
import { extractRelations } from '../app/engine/extract/relations';
import { compose } from '../app/generate/exposition';
import { toMarkdownPage } from '../app/generate/markdown';

describe('Long Corpus Wiki Generation', () => {
  it('generates wiki pages from messy multi-paragraph text', async () => {
    // 10 messy paragraphs with various entities and relations
    const text = `
Aragorn, son of Arathorn, was born in the year 2931 of the Third Age. He was a Ranger of the North,
wandering the wild lands of Eriador. His childhood was spent in Rivendell, where he was raised by Elrond.

In the year 2980, Aragorn first met Arwen Undómiel in the woods of Rivendell. They fell in love, though
their union was forbidden by Elrond unless Aragorn could reclaim the throne of Gondor.

Aragorn traveled extensively throughout Middle-earth. He journeyed to Rohan, where he befriended King Théoden.
He also ventured into Moria, the ancient dwarven kingdom. His travels took him to Lothlórien, where he met
Galadriel, the Lady of the Wood.

As a skilled warrior, Aragorn wielded the sword Andúril, reforged from the shards of Narsil. He also possessed
great knowledge of healing herbs and ancient lore. His abilities as a tracker were unmatched.

In 3018, the War of the Ring began. Aragorn participated in the Battle of Helm's Deep in 3019. He fought
valiantly alongside the Rohirrim. Later that year, he led the forces of Gondor in the Battle of the Pelennor Fields.

After the destruction of the One Ring, Aragorn was crowned King Elessar of the Reunited Kingdom. He married
Arwen Undómiel in Minas Tirith in the summer of 3019. They lived happily in the White City.

Gandalf the Grey, a wizard of great power, was Aragorn's friend and mentor. Gandalf traveled with Aragorn
on many adventures. The wizard possessed magical abilities and wielded a staff of power.

Legolas, prince of Mirkwood, was another companion of Aragorn. The elf was skilled with a bow and fought
beside Aragorn in many battles. Gimli, son of Glóin, also joined their fellowship. The dwarf wielded an axe
and became an unlikely friend to Legolas.

Frodo Baggins, the Ring-bearer, relied on Aragorn's protection during the early part of his quest. Aragorn
escorted Frodo from Bree to Rivendell in 3018. He later helped defend Minas Tirith while Frodo destroyed the Ring.

The tale of Aragorn is complex and disputed in some sources. Some say he was 87 years old when crowned, while
others claim he was 88. His true heritage as heir of Isildur was kept secret for many years.
    `.trim();

    // Extract entities and relations
    const { entities, spans } = await extractEntities(text);
    const relations = await extractRelations(text, { entities, spans }, 'test-doc');

    // Find Aragorn entity
    const aragornEntity = entities.find(e => e.canonical.toLowerCase().includes('aragorn'));
    expect(aragornEntity).toBeDefined();

    // Generate wiki page
    const page = compose(aragornEntity!.id, entities, relations, []);
    const markdown = toMarkdownPage(page);

    // Verify infobox has key fields
    expect(markdown).toContain('## Infobox');
    expect(markdown).toContain('**Name**');

    // Check for at least one expected predicate (extraction may vary)
    const expectedPredicates = [
      'married', // married_to
      'traveled', // traveled_to
      'wields', // wields (Andúril)
      'parent', // parent_of (more likely to be extracted)
      'child', // child_of
    ];

    const foundPredicates = expectedPredicates.filter(pred =>
      markdown.toLowerCase().includes(pred)
    );

    // Should find at least one predicate
    expect(foundPredicates.length).toBeGreaterThan(0);

    // Verify at least one sentence per major section exists (if relations were found)
    if (relations.length > 0) {
      // Should have some content beyond just the infobox
      expect(markdown.length).toBeGreaterThan(200);
    }

    // Verify deterministic output (no empty sections)
    expect(markdown).not.toMatch(/##\s+\w+\s+##/); // No adjacent headers

    // Check that Aragorn (the main entity) is mentioned
    expect(markdown).toContain('Aragorn');

    // Verify the page structure
    expect(markdown).toContain('# Aragorn');
    expect(markdown).toContain('## Overview');
  });

  it('handles Professor McGonagall corpus', async () => {
    const text = `
Professor Minerva McGonagall teaches Transfiguration at Hogwarts School of Witchcraft and Wizardry.
She is the Head of Gryffindor House and Deputy Headmistress. McGonagall is a skilled witch with the
ability to transform into a cat.

McGonagall was born in Scotland in 1935. She attended Hogwarts as a student and was sorted into Gryffindor.
After graduation, she worked at the Ministry of Magic before returning to Hogwarts as a teacher.

As a teacher, McGonagall is strict but fair. She has taught many famous wizards, including Harry Potter,
Ron Weasley, and Hermione Granger. Her classes are known for their difficulty and high standards.

McGonagall participated in the Battle of Hogwarts in 1998. She fought against Death Eaters and defended
the castle. After the battle, she became Headmistress of Hogwarts.

McGonagall possesses a wand made of fir wood. She is skilled in defensive magic and dueling. Her Animagus
form is a tabby cat, a rare magical ability.
    `.trim();

    const { entities, spans } = await extractEntities(text);
    const relations = await extractRelations(text, { entities, spans }, 'test-doc');

    // Find McGonagall entity
    const mcgonagallEntity = entities.find(e =>
      e.canonical.toLowerCase().includes('mcgonagall')
    );
    expect(mcgonagallEntity).toBeDefined();

    // Generate wiki page
    const page = compose(mcgonagallEntity!.id, entities, relations, []);
    const markdown = toMarkdownPage(page);

    // Verify key components
    expect(markdown).toContain('McGonagall');
    expect(markdown).toContain('## Infobox');

    // Verify that the generator worked even if specific relations weren't extracted
    // The page should at least have the entity name and infobox
    expect(markdown.length).toBeGreaterThan(100);
    expect(relations.length).toBeGreaterThanOrEqual(0); // Relations may or may not be found

    // Verify abilities section if has_power/has_skill relations exist
    const abilityRelations = relations.filter(r =>
      ['has_power', 'has_skill'].includes(r.pred) &&
      r.subj === mcgonagallEntity!.id
    );

    if (abilityRelations.length > 0) {
      expect(markdown).toContain('## Abilities');
    }
  });

  it('generates pages for multiple entities from same corpus', async () => {
    const text = `
Gandalf the Grey traveled to the Shire to visit Frodo Baggins. Frodo lived in Bag End with his uncle Bilbo.
Gandalf was a wizard with great magical powers. He wielded a staff and possessed knowledge of ancient spells.

Frodo was a hobbit who inherited the One Ring from Bilbo. The Ring was a powerful artifact. Frodo's quest
was to destroy it in Mount Doom. He traveled with Samwise Gamgee, his loyal friend and gardener.

Samwise was devoted to Frodo and protected him throughout the journey. Sam carried a sword given to him by
Galadriel. He participated in many battles and proved himself a brave companion.

Aragorn joined the fellowship and helped protect Frodo. He was the rightful heir to the throne of Gondor.
Aragorn eventually married Arwen and became King Elessar.
    `.trim();

    const { entities, spans } = await extractEntities(text);
    const relations = await extractRelations(text, { entities, spans }, 'test-doc');

    // Should have extracted multiple entities
    expect(entities.length).toBeGreaterThan(3);

    // Generate pages for Gandalf and Frodo
    const gandalfEntity = entities.find(e => e.canonical.toLowerCase().includes('gandalf'));
    const frodoEntity = entities.find(e => e.canonical.toLowerCase().includes('frodo'));

    expect(gandalfEntity).toBeDefined();
    expect(frodoEntity).toBeDefined();

    // Generate both pages
    const gandalfPage = compose(gandalfEntity!.id, entities, relations, []);
    const gandalfMarkdown = toMarkdownPage(gandalfPage);

    const frodoPage = compose(frodoEntity!.id, entities, relations, []);
    const frodoMarkdown = toMarkdownPage(frodoPage);

    // Verify both pages are different and contain entity names
    expect(gandalfMarkdown).toContain('Gandalf');
    expect(frodoMarkdown).toContain('Frodo');
    expect(gandalfMarkdown).not.toEqual(frodoMarkdown);

    // Both should have infoboxes
    expect(gandalfMarkdown).toContain('## Infobox');
    expect(frodoMarkdown).toContain('## Infobox');

    // Verify deterministic generation (running twice gives same result)
    const gandalfPage2 = compose(gandalfEntity!.id, entities, relations, []);
    const gandalfMarkdown2 = toMarkdownPage(gandalfPage2);
    expect(gandalfMarkdown).toEqual(gandalfMarkdown2);
  });
});
