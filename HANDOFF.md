# Handoff / Resume Notes (Care-assurance)

## What changed recently
- Testing Features optimizer: shift bars (fixed 8h), office staff detection, double‑up calls (locked to shared time), back‑to‑back packing within AM/Lunch/Tea/Evening/Night, and 06:00–22:00 (warn after 22:00, hard warning after 23:00).
- Admin library: save/search care worker rotas, includes shift bars and double‑up flags.
- Homepage: visible Terms & Conditions + Privacy Policy links from the home screen.
- Defaults: theme now defaults to dark on first load (still respects saved user setting).
- Docs: Access Care Planning EMAR export steps + Copilot vs GPT‑5.1 deck (Markdown + generated PPTX).
- EMAR: grid parser is now the primary extraction path when the grid is valid. AI extraction/validation and equivalence checks are skipped in grid mode for speed/cost. PRN status also respects grid PRN codes when instructions are missing.
- EMAR: demo mode now works without DB for EMAR runs (uses `req.user` and skips file-scan logging / corrections lookup when `DATABASE_URL` is missing).
- AI client accepts `OPENAI_API_KEY` directly (in addition to `OPENAI_FALLBACK_API_KEY`).

## Quick checks
- `npm run check`

## Presentation
- PPTX file: `COPILOT_VS_GPT51_PRESENTATION.pptx`
- Regenerate: `node script/generate-copilot-vs-gpt51-pptx.js`

## IMPORTANT: New codespace vs reopening this one
- If you **open a new codespace** from the repo, you will only see these changes if they are **committed and pushed**.
- If you **reopen this same codespace**, uncommitted local changes should still be present.

## Current working tree
Run `git status --short` to see modified/untracked files before you close the codespace.

## EMAR quick test (local dev)
- Start dev server with `OPENAI_API_KEY` in the environment.
- Demo login: `POST /api/auth/demo`
- EMAR: `POST /api/ai/analyze-emar` with form file `attached_assets/EMAR-1-3689_1765344478636.pdf`
- Latest local run (grid-primary): 120 entries, 14 meds, 7 days, 4 time slots; `extractionMethod=grid-parser`, validation skipped.
