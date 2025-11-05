// @ts-nocheck
import fs from "fs";
import path from "path";

const chapter = "/tmp/barty-chapter-2.txt";
const modRel = process.env.MODULE_PATH || "./app/engine/fiction-extraction";

if (!fs.existsSync(chapter)) {
  console.error("❌ Missing chapter file. Run textutil/sed step first.");
  process.exit(1);
}

let mod: any;
try {
  mod = require(path.resolve(modRel));
} catch {
  mod = require(modRel);
}

const ex = mod?.default ?? mod;
const text = fs.readFileSync(chapter, "utf8");

const characters = ex.extractFictionCharacters(text);
const highlights = ex.extractFictionEntities(text);
const relations = ex.extractFictionRelations(text, characters, "barty-ch2");

console.log("\nTop Characters (first 10):", characters.slice(0, 10));
console.log("\nFiction Highlights (first 15):", highlights.slice(0, 15));
console.log("\nRelations (first 10):", relations.slice(0, 10));
