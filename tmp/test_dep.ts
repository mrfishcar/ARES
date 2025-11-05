import { parseWithService, normalizeName } from '../app/engine/extract/entities';
import type { EntityType } from '../app/engine/schema';

const PERSON_ROLES = new Set([
  'wizard','mage','sorcerer','witch','king','queen','prince','princess','lord','lady','man','woman','boy','girl','person','scientist','professor','teacher','doctor','captain','commander','leader','child','son','daughter','parent','father','mother','warrior','knight','soldier','elf','hobbit','dwarf','human'
]);
const FAMILY_WORDS = new Set(['son','daughter','father','mother','brother','sister','parent','child','ancestor','descendant']);
const MOTION_VERBS = new Set(['travel','traveled','go','went','move','moved','journey','journeyed','walk','walked','dwell','dwelt','live','lived']);
const SOCIAL_VERBS = new Set(['marry','married','befriend','befriended','meet','met','know','knew','love','loved','hate','hated']);
const LOC_PREPS = new Set(['in','at','to','from','into','near','by']);

async function run() {
  const parsed = await parseWithService(`He quickly became friends with Ron and Hermione.`);
  const sent = parsed.sentences[0];
  const spans: { text: string; type: EntityType; start: number; end: number }[] = [];
  const tokens = sent.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!/^[A-Z]/.test(tok.text)) continue;
    let entityType: EntityType | null = null;
    if (tok.dep === 'nsubj' && tok.head !== tok.i) {
      const headToken = tokens.find(t => t.i === tok.head);
      if (headToken && (headToken.pos === 'VERB' || headToken.pos === 'AUX')) {
        const headLemma = headToken.lemma.toLowerCase();
        if (MOTION_VERBS.has(headLemma) || SOCIAL_VERBS.has(headLemma)) {
          entityType = 'PERSON';
        } else if (headLemma === 'be') {
          const attrToken = tokens.find(t => t.head === headToken.i && (t.dep === 'attr' || t.dep === 'acomp'));
          if (attrToken && PERSON_ROLES.has(attrToken.lemma.toLowerCase())) {
            entityType = 'PERSON';
          }
        } else {
          entityType = 'PERSON';
        }
      }
    }
    if (tok.dep === 'pobj' && tok.head !== tok.i) {
      const prepToken = tokens.find(t => t.i === tok.head);
      if (prepToken && prepToken.pos === 'ADP') {
        const prepLemma = prepToken.lemma.toLowerCase();
        const prepHead = tokens.find(t => t.i === prepToken.head);
        if (prepHead && FAMILY_WORDS.has(prepHead.lemma.toLowerCase())) {
          entityType = 'PERSON';
        } else if (LOC_PREPS.has(prepLemma)) {
          if (prepHead && prepHead.pos === 'VERB' && MOTION_VERBS.has(prepHead.lemma.toLowerCase())) {
            entityType = 'PLACE';
          } else {
            entityType = 'PLACE';
          }
        }
      }
    }
    if (tok.dep === 'appos' && tok.head !== tok.i) {
      const card = tokens.find(t => Math.abs(t.i - tok.i) <= 3 && FAMILY_WORDS.has(t.lemma.toLowerCase()));
      if (card) entityType = 'PERSON';
    }
    if (tok.dep === 'dobj' && tok.head !== tok.i) {
      const headToken = tokens.find(t => t.i === tok.head);
      if (headToken && headToken.pos === 'VERB' && SOCIAL_VERBS.has(headToken.lemma.toLowerCase())) {
        entityType = 'PERSON';
      }
    }
    if (tok.dep === 'nmod' && tok.head !== tok.i) {
      const headToken = tokens.find(t => t.i === tok.head);
      const verbRelation = tokens.find(t => t.pos === 'VERB' && (t.i === headToken?.head || (headToken && tokens.some(x => x.head === t.i && x.i === headToken.i))));
      if (verbRelation) {
        const verbLemma = verbRelation.lemma.toLowerCase();
        if (MOTION_VERBS.has(verbLemma) || SOCIAL_VERBS.has(verbLemma)) {
          entityType = 'PERSON';
        }
      }
    }
    if (!entityType && tok.dep === 'conj') {
      const headToken = tokens.find(t => t.i === tok.head);
      if (headToken && /^[A-Z]/.test(tok.text) && (headToken.ent === 'PERSON' || /^[A-Z]/.test(headToken.text))) {
        entityType = 'PERSON';
      }
    }
    if (entityType) {
      let startIdx = i;
      let endIdx = i;
      for (let j = i - 1; j >= 0; j--) {
        if (tokens[j].dep === 'compound' && tokens[j].head === tok.i) {
          startIdx = j;
        } else {
          break;
        }
      }
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].dep === 'compound' && tokens[j].head === tok.i) {
          endIdx = j;
        } else {
          break;
        }
      }
      const slice = tokens.slice(startIdx, endIdx + 1);
      const text = normalizeName(slice.map((t: any) => t.text).join(' '));
      spans.push({ text, type: entityType, start: slice[0].start, end: slice[slice.length - 1].end });
    }
  }
  console.log(spans);
}

run();
