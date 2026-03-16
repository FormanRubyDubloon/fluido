# Fluido

A web-first spaced repetition flashcard app powered by FSRS-5. Import Anki decks, review cards on a scientifically optimised schedule, and sync progress across devices.

**Live:** Deployed on Vercel — works on desktop and mobile browsers.

## Features

### Core
- **Anki import** — full .apkg support including legacy (pre-2.1.50) and modern (zstd + protobuf) formats. Imports cards, templates, media, review history, and scheduling state.
- **FSRS-5 scheduling** — next-generation spaced repetition algorithm via ts-fsrs. Carries over existing Anki intervals and adapts from there.
- **Learning steps** — new and lapsed cards re-enter the review queue at timed intervals within a session, just like Anki.
- **Review sessions** — flip cards, rate (Again/Hard/Good/Easy or simple Again/Good mode), undo, keyboard shortcuts (Space, Esc, 1-4, Ctrl+Z, R).
- **Card rendering** — full Anki template engine: HTML, CSS, images, audio, furigana (ruby), cloze deletions, conditionals.

### Cloud sync
- **Supabase backend** — Postgres database with Row Level Security. Each user's data is fully isolated.
- **Cross-device sync** — push local data to the cloud, pull it down on another device. Reviews sync in the background after each rating.
- **Media sync** — audio, images, and fonts upload to Supabase Storage and download on demand.
- **Freshness check** — before starting a review session, the app checks if the cloud has newer data and offers to download it.
- **Auth** — email/password via Supabase Auth.

### Statistics
- Today summary: cards reviewed, average time, retention rate, rating breakdown.
- Card state counts: new, learning, young, mature, suspended, total.
- 30-day review history chart (stacked by rating).
- 30-day due forecast chart.
- 30-day rolling retention rate.
- Global or per-deck filtering.

### Customisation
- Dark / light mode.
- New cards per day limit.
- Learning and relearning step intervals.
- FSRS desired retention (0.70–0.99) and custom weights.
- Simple rating mode (Again/Good only, hides Hard/Easy).
- Per-language font preferences with system font detection.
- Deck management: rename, edit card templates (HTML/CSS), reset progress, delete.

### Data safety
- **IndexedDB** — all data persists locally in the browser.
- **File System Access API** — optionally link a .db file on disk for auto-saving (Chromium browsers).
- **Export** — download a full backup as a ZIP (database + media).
- **Cloud backup** — all data stored in Supabase with RLS.

## Quick start

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173).

## Environment variables

Create a `.env` file in the project root:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_publishable_key
```

Without these, the app runs in offline-only mode (no auth, no sync).

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start dev server at localhost:5173 |
| `pnpm build` | Type-check and production build to `dist/` |
| `pnpm preview` | Preview production build locally |
| `pnpm test` | Run SRS scheduling test suite |
| `pnpm test:watch` | Run tests in watch mode |

## Tech stack

| Layer | Technology |
|---|---|
| UI | React 19, TypeScript, Tailwind CSS v4 |
| Bundler | Vite |
| State | Zustand |
| Database (local) | sql.js (SQLite → WASM), IndexedDB persistence |
| Database (cloud) | Supabase (Postgres) |
| Auth | Supabase Auth (email/password) |
| Storage | Supabase Storage (media files) |
| SRS algorithm | ts-fsrs (FSRS-5) |
| Import | JSZip, fzstd (zstd decompression) |
| Sanitisation | DOMPurify |

## Architecture

Fluido is a **local-first SPA**. The primary data store is an in-browser SQLite database (sql.js/WASM) persisted to IndexedDB. Supabase acts as an optional cloud backend for auth, sync, and media storage.

The codebase uses a **platform adapter** pattern. The web adapter (sql.js + IndexedDB + Supabase) is the current implementation. Electron and Capacitor (iOS) adapters are stubbed — swapping the adapter is all that's needed to run on native platforms.

```
src/
├── platform/       # Adapter interface + web/electron/capacitor implementations
├── db/             # SQLite schema, migrations, repository queries
├── import/         # .apkg import pipeline (unzip → parse → map → store media)
├── srs/            # Scheduler interface + FSRS-5 implementation + queue + rating
├── renderer/       # Card rendering (Anki templates, sanitisation)
├── sync/           # Cloud sync (push, pull, media, freshness check)
├── store/          # Zustand stores (auth, decks, review, settings, stats, sync)
├── components/
│   ├── auth/       # Login page, sync banner
│   ├── deck/       # Deck browser, import button
│   ├── layout/     # Shell, sidebar, sync button, persistence banner
│   ├── review/     # Review session, card face, rating bar, sync check modal
│   ├── settings/   # Settings panel (appearance, review, FSRS, fonts, data)
│   └── stats/      # Statistics page with charts
├── hooks/          # useKeyboard, useAudio
├── lib/            # Utilities (IDs, time, constants, fonts, Supabase client)
└── App.tsx         # Root component with auth gate and routing
```

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Run the SQL schema in the SQL Editor (creates tables, indexes, RLS policies, and a media storage bucket). See the project's Supabase migration file.
3. Go to Authentication → Providers → Email → disable "Enable email confirmations" for development.
4. Copy the project URL and publishable key into your `.env`.

## Deployment

The app is deployed on Vercel:

```bash
# Add env vars to Vercel first (Settings → Environment Variables)
npx vercel --prod
```

Pushes to the `main` branch auto-deploy via GitHub integration.

## Roadmap

| Phase | Status |
|---|---|
| .apkg import (legacy + modern) | ✅ |
| FSRS-5 scheduling | ✅ |
| Review sessions with full Anki rendering | ✅ |
| Statistics dashboard | ✅ |
| Settings and customisation | ✅ |
| Cloud sync (Supabase) | ✅ |
| Card creation and editing | Planned |
| Phoneme training module | Planned |
| AI content engine | Planned |
| Audio shadowing | Planned |
| Writing practice | Planned |
| Electron desktop app | Planned |
| iOS app via Capacitor | Planned |

## License

Private — not yet open-sourced.
