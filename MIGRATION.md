# Supabase-Primary Migration

Replaced the local-first SQLite + sync architecture with Supabase as the single source of truth.

## Why

The old architecture maintained a local SQLite database (sql.js in-memory + IndexedDB persistence) as the source of truth, with a custom bidirectional sync layer mirroring data to Supabase. This was over-engineered:

- ~500 lines of manual sync code (push, pull, freshness checks, media sync caching)
- Progress percentage math with hardcoded offsets across sync stages
- Duplicate push functions (`pushRows` vs `pushRowsWithProgress`)
- Client-side `user_id` injection (should be handled by RLS)
- Placeholder Supabase client created even when unconfigured
- Platform adapter abstraction for a single platform

## What was removed

### Files deleted (18 files, ~1,200 lines)

| Directory | Files | Purpose |
|-----------|-------|---------|
| `src/sync/` | `index.ts`, `push.ts`, `pull.ts`, `freshness.ts`, `media.ts`, `prefetch.ts` | Custom bidirectional sync layer |
| `src/platform/` | `adapter.ts`, `web.ts` | Platform abstraction (DbAdapter, FileAdapter, PlatformAdapter) |
| `src/db/` | `schema.sql`, `init.ts`, `repository.ts` | Local SQLite schema, initialization, query functions |
| `src/store/` | `sync-store.ts` | Sync progress state |
| `src/components/` | `SyncButton.tsx`, `SyncProgress.tsx`, `SyncBanner.tsx`, `SyncCheckModal.tsx`, `MediaPrefetchModal.tsx`, `PersistenceBanner.tsx` | Sync UI |

### Dependencies removed

- `idb-keyval` — IndexedDB key-value storage (no longer needed)

## What was added

### `src/lib/queries.ts`

Single data access layer. All Supabase reads and writes go through this module. Exports typed async functions:

- `getAllDecksWithCounts()` — calls the `get_decks_with_counts` RPC
- `getReviewQueue(deckId, newCardsPerDay)` — calls the `get_review_queue` RPC
- `commitReview(data)` — parallel writes to `card_states`, `cards`, `review_logs`
- `undoReview(...)` — reverses a review
- `renameDeck()`, `deleteDeck()`, `resetDeckProgress()` — deck CRUD
- `getNoteType()`, `getNoteTypesForDeck()`, `updateNoteTypeTemplates()` — note type access
- `getSettings()`, `setSetting()` — reads/writes the `user_settings` JSON blob
- `getStats(deckId?)` — fetches all stats data (today, card counts, 30-day history, forecast, retention)
- `batchUpsert(table, rows)` — batch insert for imports
- `getExistingSourceIds()`, `sampleNoteFields()` — helpers for import dedup and font detection

### `src/lib/media.ts`

Media URL resolution via Supabase Storage signed URLs with in-memory caching:

- `getMediaUrl(deckId, filename)` — returns a signed URL (cached for 1 hour)
- `uploadMedia(deckId, filename, data)` — uploads to Supabase Storage
- `clearMediaCache()` — clears the URL cache

### `supabase/migrations/001_rls_and_functions.sql`

SQL migration that must be run against the Supabase project:

1. **RLS policies** — enables row-level security on all 7 tables with `auth.uid() = user_id` policies
2. **Default `user_id`** — sets `DEFAULT auth.uid()` on all tables so inserts don't need to pass it explicitly
3. **`get_decks_with_counts()`** — RPC function returning all decks with new/learning/due card counts in a single query
4. **`get_review_queue(deck_id, new_limit)`** — RPC function returning review + learning + new cards for a session, with daily new-card limit enforcement

## What was rewritten

### Stores

All Zustand stores now call `queries.ts` instead of `getDb()`:

- **`settings-store.ts`** — reads/writes the `user_settings` JSON blob via `getSettings()`/`setSetting()`. Setters are optimistic (update state immediately, persist in background).
- **`deck-store.ts`** — `loadDecks()` calls `getAllDecksWithCounts()` RPC.
- **`stats-store.ts`** — `loadStats()` fetches stats via parallel Supabase queries.
- **`review-store.ts`** — `startSession()` is now async (fetches queue from Supabase). `rateCard()` uses optimistic updates — computes FSRS state client-side, updates Zustand immediately, persists to Supabase in the background.
- **`auth-store.ts`** — unchanged.

### SRS layer

- **`queue.ts`** — `buildQueue()` is now async, delegates to `getReviewQueue()` RPC.
- **`rating.ts`** — `commitRating()` renamed to `computeRating()`. Computes FSRS state synchronously, fires Supabase write as fire-and-forget. New `revertRating()` function for undo.
- **`fsrs.ts`**, **`engine.ts`**, **`types.ts`** — unchanged. FSRS computation stays fully client-side.

### Renderer

- **`sanitise.ts`** — `resolveMedia()` now uses `getMediaUrl()` from `media.ts` (signed URLs) instead of `getFiles().getMediaUrl()` (IndexedDB + cloud fallback).
- **`anki-template.ts`** — `renderCard()` fetches note types via `getNoteType()` query instead of `getDb().exec()`.

### Import pipeline

- **`mapper.ts`** — `mapAndInsert()` renamed to `mapCollection()`. No longer inserts into any database. Returns data arrays (`decks`, `noteTypes`, `notes`, `cards`, `cardStates`, `reviewLogs`) for the caller to insert. Takes `existingSourceIds` map for dedup instead of querying locally.
- **`media.ts`** — `storeMediaFiles()` now calls `uploadMedia()` to upload directly to Supabase Storage instead of IndexedDB.
- **`index.ts`** — `importApkg()` orchestrates: parse → map → batch upsert to Supabase → upload media. No more `forceFullPush()` call.

### Components

- **`App.tsx`** — simplified bootstrap. No more `createWebAdapter()`, `initPlatform()`, `db.open()`, `initDatabase()`. Just `initAuth()`, then load settings + decks once authenticated. Removed sync check modal and media prefetch modal from the review flow.
- **`Shell.tsx`** — removed `SyncButton` and `SyncProgress` from the sidebar.
- **`DeckBrowser.tsx`** — deck rename/delete/reset use `queries.ts` functions instead of raw SQL via `getDb()`. `EditTemplatesModal` fetches note types via `getNoteTypesForDeck()`.
- **`ImportButton.tsx`** — uses a native file input instead of `getFiles().pickApkgFile()`.
- **`SettingsPanel.tsx`** — removed the "Data" section (Save File, Export Backup, Reset Media Sync) since there's no local database or media cache to manage.

### Other

- **`lib/supabase.ts`** — removed the placeholder client (`https://placeholder.supabase.co`). Now throws if env vars are missing.
- **`lib/constants.ts`** — removed `IDB_DATABASE_KEY`, `IDB_MEDIA_PREFIX`, `SCHEMA_VERSION`.
- **`lib/fonts.ts`** — `detectLanguagesFromCards()` is now async, queries Supabase via `sampleNoteFields()`.

## Trade-offs

- **No offline support.** The app requires an internet connection. Card reviews, imports, and all data access go through Supabase.
- **Review latency.** Card ratings use optimistic updates (UI responds instantly, Supabase write happens in background). If the write fails, the error is logged but doesn't block the user.
- **Media via signed URLs.** Images and audio are served via Supabase Storage signed URLs (1-hour expiry, cached in memory). No more local IndexedDB media cache.
- **sql.js still bundled.** It's only used by the APKG parser to read Anki's embedded SQLite database during import. The `sql-wasm.wasm` file in `public/` must be kept.

## Deployment steps

1. Run the SQL migration against your Supabase project:
   ```
   supabase/migrations/001_rls_and_functions.sql
   ```
   This can be done via the Supabase SQL Editor or the CLI (`supabase db push`).

2. Ensure your `.env` has:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

3. Build and deploy:
   ```
   pnpm build
   ```
