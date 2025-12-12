# Kodex Prompt – Entity Sidebar and Debug Report System

Paste this as the first message to Kodex in the ARES project to guide the right-hand entity sidebar and JSON report implementation.

⸻

💾 Prompt for Kodex – Entity Sidebar + Debug Report System

You are a senior TypeScript/React engineer working inside my ARES repo.

Your task is to design and implement a right-hand Entity Sidebar UI plus a JSON debug report system that captures entity review feedback for downstream AI agents and debugging.

This sidebar is part of the existing entity highlighting workflow. There is already logic for entities and highlights; you must integrate with that, not reinvent the entity model.

⸻

1. High-level goals
    1. Implement a right-hand entity sidebar that:
    • Shows entities in a table-like list but with “pill-style” rows (rounded, card-like).
    • Lets the user:
    • See each entity and its name
    • Change entity type from a dropdown
    • Reject an entity (which removes it both from the sidebar list and from the text highlights)
    • Add freeform notes per entity
    2. Implement a JSON debug report system that:
    • Captures the final state of reviewed entities (types, rejections, notes, etc.)
    • Can be:
    • Logged to disk in the repo
    • Copied to clipboard
    • Is structured to be machine-readable and debugging-friendly for AI agents.
    3. The sidebar lives on the right side of the console UI, integrated with the existing notes/entity highlighting view.

⸻

2. Entity Sidebar UI – Layout and behavior

Create or extend the existing Entity Sidebar component so it has this structure:

A. Overall Sidebar
    • Right-hand panel, vertically scrollable if there are many entities.
    • Visual style:
    • Background consistent with app theme.
    • Clear separation from main editor area (border or subtle shadow).
    • Uses existing design tokens / CSS variables where possible.

At the top of the sidebar, add:
    1. Header – e.g. Entities plus a count: Entities (12)
    2. Two primary actions:
    • “Log Report” button
    • Generates the current JSON debug report and saves it to disk.
    • “Copy Report” button
    • Generates the current JSON debug report and copies it to clipboard.

These buttons operate on the current document’s entity state (including any changes made in this sidebar).

B. Entity List – Table-like but pill-style rows

Under the header, render a list of entities as rows that feel like a table but styled as pill/capsule cards.

For each entity row, include the following columns:
    1. Entity Name
    • Shows the current entity name / surface text.
    • If an entity has a canonical name, use that; otherwise show the span text.
    • Make it visually primary (left-most).
    2. Entity Type (dropdown)
    • A select/dropdown control that lists available entity types (reuse the types already used elsewhere in the app: PERSON, PLACE, ITEM, etc.).
    • Changing this updates the entity’s type in the canonical entity state used by the app.
    • Should update the highlighting / graph data consistently with existing patterns.
    3. Reject Button
    • A small button (icon or text like “Reject”).
    • When clicked:
    • Marks the entity as rejected in the underlying data model.
    • Removes it from the sidebar list.
    • Removes its highlights from the text editor (entity highlight overlay) using the existing entity/highlight management logic.
    • Rejection should be reflected in the generated report.
    4. Notes field
    • A text input or small textarea for freeform notes.
    • Notes should be:
    • Persisted in the in-memory entity state for this session.
    • Included in the JSON debug report.
    • Keep it compact by default; multi-line is fine but don’t let it blow the layout.

Visual style for rows:
    • Each row is a “pill” / card:
    • Rounded corners
    • Slight background contrast
    • Row-level hover state
    • Fields (name, type, reject button, notes) are aligned horizontally as much as possible on wider screens, but it’s fine to stack the notes field below on smaller widths.

⸻

3. JSON Debug Report – Structure and behavior

You must design a JSON structure that is optimal for debugging and AI agent consumption.

A. Report generation

Create a helper that can produce a JSON object with at least:

{
  runId: string;              // unique ID for this review session
  documentId: string | null;  // ID or filename of the source document, if available
  createdAt: string;          // ISO timestamp
  userContext?: {
    // optional: any relevant metadata like project, environment, etc.
  };
  summary: {
    totalEntities: number;
    keptEntities: number;
    rejectedEntities: number;
    changedTypeCount: number;  // how many entities had type changes
    notesCount: number;        // how many entities have notes
  };
  entities: Array<{
    id: string;
    originalType: string;
    finalType: string;
    rejected: boolean;
    name: string;
    spans: Array<{
      start: number;          // character offsets into document
      end: number;
      text: string;           // text slice for debugging
    }>;
    notes: string | null;
    issues?: string[];        // optional: any flagged issues
  }>;
  // If available, you can also include:
  extractionMetadata?: {
    engineVersion?: string;
    config?: any;
  };
}

The key requirement:
The entities array must clearly show, for each entity:
    • Original type vs final type
    • Whether it was rejected
    • Notes from the sidebar
    • Where in the text it lived (spans)

This is what downstream AI agents will read to understand what went wrong or what should change.

B. “Log Report” behavior
    • When the user clicks “Log Report”:
    • Generate the JSON report based on the current sidebar/entity state.
    • Save it to disk in a dedicated folder in the repo, for example:
    • data/entity-reports/
    or
    • app/debug/entity-reports/
    • File naming convention example:
    • entity-report-<documentId>-<timestamp>.json
    • Implement a small Node/backend utility/module to ensure file writes happen server-side, not in the browser bundle.

Wherever you put this module, keep it obvious and documented so AI agents can later be pointed there to read these reports.

C. “Copy Report” behavior
    • When the user clicks “Copy Report”:
    • Generate the same JSON object.
    • JSON.stringify it with reasonable formatting (2 spaces).
    • Copy it to the clipboard using navigator.clipboard.writeText in the UI.

If Clipboard API is unavailable, degrade gracefully (e.g., show the JSON in a modal for manual copying).

⸻

4. Integration details
    1. Use the existing entity state
    • Do not create a parallel entity store.
    • Hook the sidebar into the same entity objects used by the highlighting system.
    • When the user changes type or rejects an entity, you must update the canonical entity state, not just local UI.
    2. Removing highlights on reject
    • When the reject button is clicked, make sure:
    • The entity is removed or marked rejected in the state.
    • Its associated highlights are removed from the CodeMirror/entity overlay.
    • Any graph/knowledge structures that are derived from active entities no longer include that entity.
    3. Notes and debug fields
    • Notes should live in the same entity-level state that the report generator can read.
    • If there’s already a good place in the entity model for “review metadata” or “annotations”, reuse that; otherwise, extend the model minimally.
    4. Code organization
    • Keep the entity sidebar component focused and clean.
    • Put report-building logic into a separate helper module, e.g.:
    • app/ui/console/src/lib/entityReport.ts (front-end shaping of the JSON)
    • and a small backend helper for persistence if needed.

⸻

5. How to work and what to output
    1. First, inspect the existing entity sidebar / entity panel components and entity state structures.
    2. Propose a short plan:
    • Which files you will touch.
    • Where the sidebar lives.
    • Where the report helper will live.
    3. Implement:
    • The updated Entity Sidebar UI with table-like pill rows and all fields.
    • The JSON report builder.
    • “Log Report” and “Copy Report” behavior.
    • The directory and helper for writing reports to disk.
    4. Ensure type-safety (TypeScript) and consistent styling with the rest of the app.
    5. Show me:
    • The final React component(s).
    • The JSON report schema.
    • Where reports are written on disk.
    • How another agent can discover and read those reports.

Avoid pseudo-code. Make real changes in the repo that compile and run.

⸻

If you want, I can follow this with a tiny “progress check-in” prompt you can paste after Kodex’s first plan, but this should be enough to get it building the sidebar exactly the way you want.
