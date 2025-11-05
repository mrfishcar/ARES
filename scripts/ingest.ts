// scripts/ingest.ts
import fs from "fs";
import path from "path";
import { appendDoc } from "../app/storage/storage";

async function main() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error("❌ Usage: npx ts-node scripts/ingest.ts <path-to-text-file>");
    process.exit(1);
  }

  const filePath = path.resolve(inputFile);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  const docId = path
    .basename(filePath)
    .replace(/\.[^.]+$/, "")        // drop extension
    .replace(/[^a-zA-Z0-9_]+/g, "_") // safe id
    .toLowerCase();

  console.log(`📖 Reading ${filePath} ...`);
  const text = fs.readFileSync(filePath, "utf8");

  console.log(`🧩 Ingesting as docId="${docId}" ...`);
  await appendDoc(docId, text);

  console.log("✅ Ingest complete.");
}

main().catch((err) => {
  console.error("💥 Error during ingest:", err);
  process.exit(1);
});
