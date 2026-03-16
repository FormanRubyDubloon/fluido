# Fluido

A spaced repetition flashcard app built with FSRS-5. Import Anki decks, review cards on an optimised schedule.

## Quick Start

```bash
pnpm install
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173).

## Stack

- **React + TypeScript** — UI framework
- **Vite** — bundler and dev server
- **Tailwind CSS v4** — styling
- **Zustand** — state management
- **sql.js** — SQLite compiled to WASM (runs entirely in-browser)
- **ts-fsrs** — FSRS-5 spaced repetition scheduling
- **JSZip** — client-side .apkg extraction
- **DOMPurify** — HTML sanitisation for Anki card content

## Architecture

The app is a **local-first SPA** with no backend. All data lives in an in-browser SQLite database persisted to IndexedDB. The architecture uses a **platform adapter** pattern so the same code can run in the browser (web), Electron (desktop), and Capacitor (iOS) by swapping only the data layer.

```
src/
├── platform/     # Adapter interface + implementations (web, electron, capacitor)
├── db/           # Schema, migrations, repository queries
├── import/       # .apkg import pipeline
├── srs/          # Scheduler interface + FSRS implementation
├── renderer/     # Card rendering (Anki templates, cloze, future types)
├── store/        # Zustand stores (decks, review, settings, stats)
├── components/   # React UI components
├── hooks/        # Shared hooks (keyboard, audio, persistence)
└── lib/          # Utilities (IDs, time, constants)
```

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start dev server |
| `pnpm build` | Production build to `dist/` |
| `pnpm preview` | Preview production build locally |

## Build Plan

See `Fluido_MVP_Build_Plan.md` for the full phased development plan.
