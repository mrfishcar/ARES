#!/usr/bin/env node
/**
 * ARES Golden JSON Validator
 * - Validates schema fields
 * - Verifies all start/end indices are in-range
 * - Confirms surface === input_text.slice(start,end) (or code-point slice with --codepoints)
 * - Checks entity ID uniqueness, coref references, relation evidence spans, alias dictionary consistency
 *
 * Usage:
 *   node scripts/validate-ares-golden.js /path/to/file.json
 *   node scripts/validate-ares-golden.js /tests/golden_truth
 *   node scripts/validate-ares-golden.js /tests/golden_truth --codepoints
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: validate-ares-golden.js <file-or-dir> [--codepoints]');
  process.exit(2);
}
const targetPath = path.resolve(args[0]);
const USE_CODEPOINTS = args.includes('--codepoints');

function* walkDir(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) yield* walkDir(p);
    else if (name.endsWith('.json') && name !== 'index.json' && name !== 'schema.json') yield p;
  }
}

// Code unit vs code point helpers
function sliceByUnits(str, start, end) { return str.slice(start, end); }
function sliceByCodePoints(str, start, end) {
  const arr = Array.from(str); // splits into Unicode code points
  return arr.slice(start, end).join('');
}
const slicer = USE_CODEPOINTS ? sliceByCodePoints : sliceByUnits;
function lengthByMode(str) { return USE_CODEPOINTS ? Array.from(str).length : str.length; }

// Core validation
function validateGolden(json, file) {
  const errors = [];
  const warns  = [];
  const where = (msg, at) => `${msg}${at ? ` @ ${at}` : ''}`;

  // Required top-level fields
  const requiredTop = ['version','case_id','domain','source_notes','input_text','entities','coref_clusters','alias_dictionary','relations','dates','negative_cases','rule_upgrade_suggestions'];
  for (const k of requiredTop) {
    if (!(k in json)) errors.push(where(`Missing required top-level field "${k}"`, 'root'));
  }

  if (json.version && json.version !== 'ares-test-v1') {
    warns.push(where(`version is "${json.version}" (expected "ares-test-v1")`, 'version'));
  }

  // Basic types
  if (typeof json.input_text !== 'string') errors.push('input_text must be a string');
  const text = typeof json.input_text === 'string' ? json.input_text : '';
  const textLen = lengthByMode(text);

  // Entities
  const idSet = new Set();
  const entitiesById = new Map();
  if (Array.isArray(json.entities)) {
    json.entities.forEach((e, i) => {
      const at = `entities[${i}]`;
      for (const f of ['id','surface','start','end','type']) {
        if (!(f in e)) errors.push(where(`Entity missing field "${f}"`, at));
      }
      if (e.id) {
        if (idSet.has(e.id)) errors.push(where(`Duplicate entity id "${e.id}"`, at));
        idSet.add(e.id);
        entitiesById.set(e.id, e);
      }
      if (typeof e.start !== 'number' || typeof e.end !== 'number') {
        errors.push(where('start/end must be numbers', at));
      } else {
        if (e.start < 0 || e.end < 0 || e.start >= e.end) {
          errors.push(where(`Invalid start/end (${e.start}, ${e.end})`, at));
        }
        if (e.end > textLen) {
          errors.push(where(`end index ${e.end} exceeds input_text length ${textLen}`, at));
        }
      }
      if (typeof e.surface === 'string' && typeof e.start === 'number' && typeof e.end === 'number') {
        const actual = slicer(text, e.start, e.end);
        if (actual !== e.surface) {
          errors.push(where(`surface mismatch. Expected "${e.surface}" but slice("${e.start}","${e.end}") = "${actual}"`, at));
        }
      }
      // alias_of optional: if present, it should be an existing id (not itself)
      if (e.alias_of != null) {
        if (!entitiesById.has(e.alias_of)) {
          // we might not have loaded all IDs yet; collect and recheck later
        }
      }
    });
  } else {
    errors.push('entities must be an array');
  }

  // Re-check alias_of after we know ids
  if (Array.isArray(json.entities)) {
    json.entities.forEach((e, i) => {
      if (e.alias_of != null) {
        if (!entitiesById.has(e.alias_of)) {
          errors.push(where(`alias_of "${e.alias_of}" does not reference an existing entity id`, `entities[${i}]`));
        }
        if (e.alias_of === e.id) {
          errors.push(where('alias_of cannot reference itself', `entities[${i}]`));
        }
      }
    });
  }

  // Coref clusters
  if (!Array.isArray(json.coref_clusters)) {
    errors.push('coref_clusters must be an array');
  } else {
    json.coref_clusters.forEach((c, i) => {
      const at = `coref_clusters[${i}]`;
      if (!Array.isArray(c.members) || c.members.length === 0) {
        errors.push(where('coref cluster must have non-empty "members" array', at));
      } else {
        c.members.forEach((id, j) => {
          if (!entitiesById.has(id)) errors.push(where(`member "${id}" is not a valid entity id`, `${at}.members[${j}]`));
        });
      }
      if (!Array.isArray(c.aliases)) warns.push(where('coref cluster missing "aliases" array (optional but recommended)', at));
      if (typeof c.canonical !== 'string') warns.push(where('coref cluster missing "canonical" string (recommended)', at));
    });
  }

  // Alias dictionary
  if (typeof json.alias_dictionary !== 'object' || Array.isArray(json.alias_dictionary) || json.alias_dictionary == null) {
    errors.push('alias_dictionary must be an object { canonical: [aliases...] }');
  } else {
    for (const [canon, aliases] of Object.entries(json.alias_dictionary)) {
      if (!Array.isArray(aliases)) errors.push(where('alias_dictionary values must be arrays', `alias_dictionary["${canon}"]`));
      // Soft check: if an entity with canonical exists, its aliases should appear among surfaces or in other entities
      // (advisory)
    }
  }

  // Relations
  if (!Array.isArray(json.relations)) {
    errors.push('relations must be an array');
  } else {
    json.relations.forEach((r, i) => {
      const at = `relations[${i}]`;
      for (const f of ['type','head','tail','evidence_span']) {
        if (!(f in r)) errors.push(where(`Relation missing field "${f}"`, at));
      }
      if (r.head && !entitiesById.has(r.head)) errors.push(where(`head "${r.head}" not found among entities`, at));
      if (r.tail && !entitiesById.has(r.tail)) errors.push(where(`tail "${r.tail}" not found among entities`, at));
      if (r.evidence_span) {
        const es = r.evidence_span;
        for (const f of ['start','end','surface']) {
          if (!(f in es)) errors.push(where(`evidence_span missing "${f}"`, at));
        }
        if (typeof es.start === 'number' && typeof es.end === 'number') {
          if (es.start < 0 || es.end <= es.start || es.end > textLen) {
            errors.push(where(`Invalid evidence_span indices (${es.start}, ${es.end})`, at));
          } else {
            const actual = slicer(text, es.start, es.end);
            if (actual !== es.surface) {
              errors.push(where(`evidence_span surface mismatch. Expected "${es.surface}" but got "${actual}"`, at));
            }
          }
        }
      }
    });
  }

  // Dates
  if (!Array.isArray(json.dates)) {
    errors.push('dates must be an array');
  } else {
    json.dates.forEach((d, i) => {
      const at = `dates[${i}]`;
      for (const f of ['surface','start','end']) {
        if (!(f in d)) errors.push(where(`Date missing field "${f}"`, at));
      }
      if (typeof d.start === 'number' && typeof d.end === 'number') {
        if (d.start < 0 || d.end <= d.start || d.end > textLen) {
          errors.push(where(`Invalid date indices (${d.start}, ${d.end})`, at));
        } else if (typeof d.surface === 'string') {
          const actual = slicer(text, d.start, d.end);
          if (actual !== d.surface) errors.push(where(`date surface mismatch. "${d.surface}" vs "${actual}"`, at));
        }
      }
    });
  }

  // Negative cases
  if (!Array.isArray(json.negative_cases)) {
    errors.push('negative_cases must be an array');
  } else {
    json.negative_cases.forEach((n, i) => {
      const at = `negative_cases[${i}]`;
      for (const f of ['surface','start','end','should_tag','reasoning']) {
        if (!(f in n)) errors.push(where(`negative_case missing field "${f}"`, at));
      }
      if (typeof n.start === 'number' && typeof n.end === 'number') {
        if (n.start < 0 || n.end <= n.start || n.end > textLen) {
          errors.push(where(`Invalid negative_case indices (${n.start}, ${n.end})`, at));
        } else if (typeof n.surface === 'string') {
          const actual = slicer(text, n.start, n.end);
          if (actual !== n.surface) errors.push(where(`negative_case surface mismatch. "${n.surface}" vs "${actual}"`, at));
        }
      }
    });
  }

  // Rule suggestions
  if (!Array.isArray(json.rule_upgrade_suggestions)) {
    errors.push('rule_upgrade_suggestions must be an array');
  } else if (json.rule_upgrade_suggestions.length < 1) {
    warns.push('rule_upgrade_suggestions is empty (recommend 5–10 items)');
  }

  return { errors, warns };
}

function validateFile(p) {
  let json;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    json = JSON.parse(raw);
  } catch (e) {
    return { errors: [`Failed to read/parse JSON: ${e.message}`], warns: [] };
  }
  return validateGolden(json, p);
}

function main() {
  const files = [];
  const st = fs.statSync(targetPath);
  if (st.isDirectory()) {
    for (const p of walkDir(targetPath)) files.push(p);
  } else {
    files.push(targetPath);
  }

  let totalErrors = 0;
  let totalWarns = 0;

  for (const f of files) {
    const { errors, warns } = validateFile(f);
    const rel = path.relative(process.cwd(), f);
    if (errors.length || warns.length) {
      console.log(`\n▶ ${rel}`);
      if (errors.length) {
        console.log('  ❌ Errors:');
        errors.forEach(e => console.log('   - ' + e));
      }
      if (warns.length) {
        console.log('  ⚠️  Warnings:');
        warns.forEach(w => console.log('   - ' + w));
      }
    } else {
      console.log(`\n▶ ${rel}\n  ✅ OK`);
    }
    totalErrors += errors.length;
    totalWarns += warns.length;
  }

  console.log(`\nSummary: ${files.length} file(s) checked — ${totalErrors} error(s), ${totalWarns} warning(s).`);
  process.exit(totalErrors > 0 ? 1 : 0);
}

main();
