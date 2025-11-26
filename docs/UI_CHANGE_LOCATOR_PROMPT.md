# Prompt for locating the previous magical-minimal UI changes

Copy/paste the prompt below to guide another Kodex operator working on the `feature/magical-minimal-ui` branch. It points them directly to every file touched by the prior UI polish so they can inspect or extend the work without hunting around the repo.

```
You are working on the `feature/magical-minimal-ui` branch of the ARES repo.

Focus on the UI polish already implemented for the console editor. The relevant files live under `app/ui/console/src/`:
- `components/CodeMirrorEditor.tsx`: CodeMirror setup, entity highlight decoration styles, cursor styling, and focus-mode toggle handling for the editor surface.
- `components/CodeMirrorEditorProps.ts`: Editor prop shape (includes focus mode flag and highlight opacity controls).
- `components/EntityIndicators.tsx`: Decorative orb indicators; styles include inner shadow, soft glow, and glisten timings.
- `pages/ExtractionLab.tsx`: Top bar (stats/controls), focus mode toggle plumbing, and layout around the editor + entity results.
- `index.css`: Global “magical minimal” theming — charcoal/indigo gradients, atmospheric grain, typography, cursor tweaks, orb styles, stat bar styles, focus-mode dimming.

If you need to adjust visuals, keep logic intact (CM6 wiring, entity/orb computations). Avoid backend changes.
```
