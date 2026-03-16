# Fluido SRS — MVP Build Plan

| Detail  | Value                                      |
|---------|--------------------------------------------|
| Version | 1.1                                        |
| Date    | March 2026                                 |
| Scope   | MVP only — web-first SRS flashcard app     |
| Inputs  | MVP PRD v0.2, Full Fluido PRD v1.0         |

---

## 1. Context

This build plan covers the MVP and nothing else: a browser-based flashcard app that imports .apkg files and runs FSRS-scheduled reviews. No backend, no accounts, no AI content.

However, the MVP is not throwaway code. It is the foundation that the full Fluido product will be built on top of — feature by feature, over many months — before eventually wrapping in Electron for desktop and Capacitor for iOS. The full product includes AI content generation, phoneme training, writing practice, audio shadowing, user accounts with cross-device sync, and multi-platform distribution (web, macOS, Windows, Linux, iOS).

That trajectory shapes every architectural decision in this plan. Where the MVP would be simpler without considering the future, but doing so would create painful refactors later, this plan chooses the forward-compatible path and calls out why.

### 1.1 Development Lifecycle

```
 YOU ARE HERE
      │
      ▼
┌───────────┐     ┌──────────────────┐     ┌────────────────────────┐
│  MVP      │────▶│  Feature Growth   │────▶│  Native Wrappers       │
│  (Web)    │     │  (still Web)      │     │                        │
│           │     │                   │     │  Electron (desktop)    │
│ .apkg     │     │ + Card creation   │     │  Capacitor (iOS)       │
│ import    │     │ + AI content      │     │                        │
│ +         │     │ + Phoneme trainer │     │  Same React app,       │
│ FSRS      │     │ + Audio shadowing │     │  different platform    │
│ review    │     │ + Writing practice│     │  adapters.             │
│           │     │ + User accounts   │     │                        │
│ ≈ 6 weeks │     │ + Cloud sync      │     │  The web codebase      │
│           │     │ + Statistics v2   │     │  IS the iOS codebase.  │
└───────────┘     └──────────────────┘     └────────────────────────┘
                   Months of iteration       Both wrappers load the
                   on the same codebase.     same UI and swap only
                   Figma MCP available        the platform adapter.
                   the entire time.
```

### 1.2 How the Full Product Shapes MVP Decisions

The full Fluido PRD introduces requirements that don't ship in the MVP but influence how the MVP is built. Each of these is flagged in the relevant build phase with a **[FUTURE]** tag.

| Future Requirement | MVP Implication |
|---|---|
| **AI-generated cards and content** (reading passages, quizzes, image cards) | The data model must support cards that are *not* imported from .apkg — cards created by the app itself. The schema needs a `source` field on notes/cards and must not couple tightly to Anki's data structures. |
| **Multiple card types** (image-to-word, audio-to-word, sentence cloze, beyond Anki templates) | The card renderer must be designed as a pluggable component, not hardcoded to Anki HTML templates. MVP ships with the Anki template renderer only, but the architecture allows adding new renderers. |
| **Phoneme training and writing practice** | These are new *activity types* that sit alongside SRS review. The app's routing and session model should accommodate multiple activity types, not assume the only thing users do is review cards. |
| **User accounts and cloud sync** | Every entity in the schema needs a stable UUID primary key (not auto-increment integers). The schema should include `created_at` and `updated_at` timestamps on all mutable tables. This costs nothing now and avoids a painful migration later. |
| **SM-2 and FSRS algorithm choice** | The full PRD specifies configurable algorithms. The MVP ships with FSRS only, but the scheduling logic should be behind an interface so SM-2 (or others) can be slotted in later. |
| **Electron migration** | All database and file I/O goes through the platform adapter interface. No direct sql.js calls anywhere in application code. |
| **iOS via Capacitor** | The same platform adapter pattern applies — Capacitor gets its own adapter implementation (SQLite via `@capacitor-community/sqlite`, filesystem via Capacitor's Filesystem plugin). But iOS also imposes **UI constraints on the MVP**: touch targets must be ≥ 44px, the layout must be responsive down to 375px width, no hover-dependent interactions, and no Web APIs can be used that WKWebView doesn't support (e.g. File System Access API must have a fallback, `navigator.storage.persist()` is unavailable). These are cheap to get right now and expensive to retrofit. |
| **Multi-language support** | The schema should include a `language` field on decks/notes from day one. The MVP doesn't enforce it, but the column exists. |

---

## 2. Technical Foundation

### 2.1 Stack

| Layer | Technology | Notes |
|---|---|---|
| Language | TypeScript (strict mode) | Across the entire codebase. |
| UI | React 18+ | Functional components, hooks only. |
| Bundler | Vite | Fast dev server, clean production builds. |
| Styling | Tailwind CSS v4 | `dark:` variant for night mode. |
| State | Zustand | Single store, sliced by domain (decks, review, settings). |
| Database | sql.js (SQLite → WASM) | Persisted to IndexedDB via OPFS or manual export. |
| SRS | ts-fsrs | FSRS-5 scheduling. |
| Zip | JSZip | Client-side .apkg extraction. |
| Sanitisation | DOMPurify | All Anki HTML content sanitised before render. |
| Persistence | idb-keyval | Lightweight IndexedDB wrapper for media blobs. |

### 2.2 Project Structure

```
fluido/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
│
├── public/
│   └── sql-wasm.wasm            # sql.js WASM binary
│
├── src/
│   ├── main.tsx                  # React entry point
│   ├── App.tsx                   # Root component, router
│   │
│   ├── platform/                 # ◀ ADAPTER LAYER
│   │   ├── adapter.ts            #   Interface definition
│   │   ├── web.ts                #   Web implementation (sql.js + IndexedDB)
│   │   ├── capacitor.ts          #   Stub — implemented at iOS migration time
│   │   └── electron.ts           #   Stub — implemented at desktop migration time
│   │
│   ├── db/                       # ◀ DATA ACCESS
│   │   ├── schema.sql            #   Table definitions
│   │   ├── migrations/           #   Versioned schema changes
│   │   ├── repository.ts         #   Query functions (decks, cards, reviews)
│   │   └── seed.ts               #   Default data (FSRS params, settings)
│   │
│   ├── import/                   # ◀ .APKG PIPELINE
│   │   ├── unzip.ts              #   Extract .apkg archive
│   │   ├── parser.ts             #   Read Anki SQLite tables
│   │   ├── mapper.ts             #   Anki data → Fluido schema
│   │   ├── media.ts              #   Store and resolve media files
│   │   └── template.ts           #   Parse Anki card templates
│   │
│   ├── srs/                      # ◀ SCHEDULING ENGINE
│   │   ├── engine.ts             #   Scheduler interface [FUTURE: pluggable]
│   │   ├── fsrs.ts               #   FSRS-5 implementation via ts-fsrs
│   │   ├── queue.ts              #   Daily review queue builder
│   │   └── types.ts              #   Rating, CardState, ReviewLog types
│   │
│   ├── renderer/                 # ◀ CARD RENDERING [FUTURE: pluggable]
│   │   ├── anki-template.ts      #   Anki HTML template → rendered card
│   │   ├── cloze.ts              #   Cloze deletion handling
│   │   └── sanitise.ts           #   DOMPurify wrapper
│   │
│   ├── store/                    # ◀ ZUSTAND STORES
│   │   ├── deck-store.ts
│   │   ├── review-store.ts
│   │   ├── settings-store.ts
│   │   └── stats-store.ts
│   │
│   ├── components/               # ◀ UI COMPONENTS
│   │   ├── layout/
│   │   │   ├── Shell.tsx         #   App frame, nav, theme toggle
│   │   │   └── Sidebar.tsx
│   │   ├── deck/
│   │   │   ├── DeckBrowser.tsx
│   │   │   ├── DeckRow.tsx
│   │   │   └── ImportButton.tsx
│   │   ├── review/
│   │   │   ├── ReviewSession.tsx
│   │   │   ├── CardFace.tsx
│   │   │   ├── RatingBar.tsx
│   │   │   ├── SessionHeader.tsx
│   │   │   └── SessionComplete.tsx
│   │   ├── stats/
│   │   │   ├── TodaySummary.tsx
│   │   │   └── CardCounts.tsx
│   │   └── settings/
│   │       └── SettingsPanel.tsx
│   │
│   ├── hooks/                    # ◀ SHARED HOOKS
│   │   ├── useKeyboard.ts
│   │   ├── useAudio.ts
│   │   └── usePersistence.ts
│   │
│   └── lib/                      # ◀ UTILITIES
│       ├── constants.ts
│       ├── time.ts
│       └── ids.ts                #   UUID generation [FUTURE: sync-safe]
│
└── tests/
    ├── import/
    ├── srs/
    └── db/
```

**Why this structure matters for the future:** The `platform/`, `srs/`, and `renderer/` directories are all built around interfaces with swappable implementations. When AI-generated cards arrive, you add a new renderer — you don't rewrite the review session. When Electron arrives, you implement `platform/electron.ts` — you don't touch any component code. When iOS arrives, you implement `platform/capacitor.ts` — same deal. When SM-2 support arrives, you add `srs/sm2.ts` — you don't restructure the scheduling layer.

### 2.3 Schema Design

```sql
-- All primary keys are TEXT (UUIDs) for future sync compatibility.
-- All mutable tables carry created_at and updated_at.

CREATE TABLE decks (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  parent_id   TEXT REFERENCES decks(id),
  language    TEXT,                        -- [FUTURE] multi-language
  source      TEXT NOT NULL DEFAULT 'anki', -- [FUTURE] 'fluido', 'ai'
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE note_types (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  fields          TEXT NOT NULL,           -- JSON array of field names
  card_templates  TEXT NOT NULL,           -- JSON array of {front, back, css}
  source          TEXT NOT NULL DEFAULT 'anki',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE notes (
  id            TEXT PRIMARY KEY,
  note_type_id  TEXT NOT NULL REFERENCES note_types(id),
  fields        TEXT NOT NULL,             -- JSON object {fieldName: value}
  tags          TEXT NOT NULL DEFAULT '[]', -- JSON array
  source        TEXT NOT NULL DEFAULT 'anki',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE cards (
  id              TEXT PRIMARY KEY,
  note_id         TEXT NOT NULL REFERENCES notes(id),
  deck_id         TEXT NOT NULL REFERENCES decks(id),
  template_index  INTEGER NOT NULL,
  card_type       TEXT NOT NULL DEFAULT 'new',
    -- 'new' | 'learning' | 'review' | 'relearning'
  source          TEXT NOT NULL DEFAULT 'anki',
  suspended       INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE card_states (
  card_id       TEXT PRIMARY KEY REFERENCES cards(id),
  difficulty    REAL NOT NULL,
  stability     REAL NOT NULL,
  due           TEXT NOT NULL,              -- ISO 8601
  interval      REAL NOT NULL,             -- days
  reps          INTEGER NOT NULL DEFAULT 0,
  lapses        INTEGER NOT NULL DEFAULT 0,
  last_review   TEXT,                      -- ISO 8601, nullable
  updated_at    TEXT NOT NULL
);

CREATE TABLE review_logs (
  id              TEXT PRIMARY KEY,
  card_id         TEXT NOT NULL REFERENCES cards(id),
  rating          INTEGER NOT NULL,         -- 1-4
  elapsed_ms      INTEGER NOT NULL,
  review_time     TEXT NOT NULL,            -- ISO 8601
  scheduled_days  REAL NOT NULL,
  actual_days     REAL,
  created_at      TEXT NOT NULL
);

CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL                     -- JSON-encoded
);

-- Performance indices
CREATE INDEX idx_cards_deck     ON cards(deck_id);
CREATE INDEX idx_cards_type     ON cards(card_type);
CREATE INDEX idx_card_states_due ON card_states(due);
CREATE INDEX idx_review_logs_card ON review_logs(card_id);
CREATE INDEX idx_review_logs_time ON review_logs(review_time);
```

---

## 3. Build Phases

The MVP is split into five phases. Each phase results in a working (if incomplete) app that can be tested end-to-end. No phase depends on Figma designs being ready — the UI starts functional and gets polished via Figma MCP iteration as the build progresses.

### Phase 0 — Scaffold and Platform Layer
**Duration: 2–3 days**
**Goal: Empty app runs in-browser with a working database.**

| # | Task | Detail |
|---|---|---|
| 0.1 | Initialise project | `pnpm create vite fluido --template react-ts`. Add Tailwind, Zustand, DOMPurify. |
| 0.2 | Configure Vite | Ensure WASM files are served correctly. Add path aliases (`@/`). |
| 0.3 | Set up sql.js | Load WASM binary, initialise in-memory database. Confirm basic queries work. |
| 0.4 | Build platform adapter interface | Define `PlatformAdapter` in `platform/adapter.ts`. Implement `platform/web.ts` — sql.js for DB, idb-keyval for media blobs. |
| 0.5 | Run schema migration | Execute `schema.sql` on first launch. Store schema version in `settings` table. |
| 0.6 | Add IndexedDB persistence | After every write transaction, export the sql.js database binary to IndexedDB. On launch, check for a persisted DB and reload it. Request `navigator.storage.persist()`. |
| 0.7 | App shell | Minimal `Shell.tsx` with a sidebar placeholder and main content area. Dark mode toggle wired to Tailwind. |
| 0.8 | Responsive foundation | Set up Tailwind breakpoints. The shell must work at 375px width (iPhone SE) through to desktop. Sidebar collapses to a bottom nav or hamburger on narrow viewports. All interactive elements must have a minimum 44×44px touch target. **[FUTURE: iOS]** |
| 0.9 | Test | Confirm: app loads, database initialises, persists across page reloads, dark mode works, layout is usable at 375px width. |

**[FUTURE] Why this matters:** The adapter interface established here is the exact seam where Electron and Capacitor swap in. The schema's UUID primary keys and timestamps are ready for sync. The `settings` table stores schema version for future migrations. The responsive layout and touch targets mean the same UI works inside Capacitor's WKWebView on iOS without a retrofit.

---

### Phase 1 — .apkg Import Pipeline
**Duration: 5–7 days**
**Goal: User can select an .apkg file and see its decks and cards in the database.**

| # | Task | Detail |
|---|---|---|
| 1.1 | File picker | `<input type="file" accept=".apkg">` wrapped in an `ImportButton` component. Reads the selected file as `ArrayBuffer`. |
| 1.2 | Unzip | Use JSZip to extract the archive. Identify `collection.anki21` (or `.anki2`) and the `media` JSON map. |
| 1.3 | Parse Anki SQLite | Open the collection database with sql.js (a *second* sql.js instance, separate from the app DB). Read `notetypes`, `notes`, `cards`, `decks` tables. |
| 1.4 | Map to Fluido schema | Convert Anki's data structures to Fluido entities. Key transformations: Anki integer IDs → Fluido UUIDs (store the Anki ID as a `source_id` for deduplication). Anki's `models` JSON → individual `note_types` rows. Anki's `decks` JSON → individual `decks` rows with parent-child hierarchy. |
| 1.5 | Store media | Iterate the media map. For each numbered file in the archive, store the blob in IndexedDB via `adapter.files.storeMedia(deckId, originalFilename, data)`. |
| 1.6 | Template parsing | Parse Anki card template strings. Implement field substitution (`{{Front}}`, `{{Back}}`, `{{FrontSide}}`). Handle `{{type:FieldName}}` and basic conditional replacements. |
| 1.7 | Cloze support (P1) | Detect cloze note types. Generate one card per `{{c1::...}}`, `{{c2::...}}` index. Render active cloze as a blank, inactive clozes as revealed text. |
| 1.8 | Initialise FSRS state | For every imported card, create a `card_states` row with FSRS-5 new-card defaults (difficulty, stability from `ts-fsrs` `createEmptyCard()`). |
| 1.9 | Duplicate detection (P1) | Before inserting, check for existing notes with the same `source_id`. Skip or update. |
| 1.10 | Import summary | After import completes, display a summary: decks created, cards imported, media files stored, any errors. |
| 1.11 | Test | Import a real .apkg (Core 2000 Japanese deck). Verify row counts, media retrieval, template rendering against Anki's output. |

**[FUTURE] Why this matters:** The `source` field on every entity distinguishes imported Anki content from content that Fluido will generate later. The mapper is deliberately kept separate from the parser so that future importers (CSV, custom format) can reuse the same insertion logic.

---

### Phase 2 — SRS Scheduling Engine
**Duration: 4–5 days**
**Goal: Cards are scheduled correctly. The queue builder returns the right cards in the right order.**

| # | Task | Detail |
|---|---|---|
| 2.1 | Scheduler interface | Define a `Scheduler` interface in `srs/engine.ts` with `schedule(card, rating) → ScheduleResult` and `getDefaults() → NewCardState`. This is the seam for future algorithm plugins. |
| 2.2 | FSRS implementation | Implement the `Scheduler` interface using ts-fsrs. Wrap `fsrs.repeat()` to return the Fluido-native `ScheduleResult` type. |
| 2.3 | Learning steps | Implement the learning step state machine: new card → step 1 (1m) → step 2 (10m) → graduate to review. Configurable step intervals stored in `settings`. |
| 2.4 | Lapse handling | When a review card is rated Again: move to `relearning`, apply relearning steps (default: 10m), increment lapse count. |
| 2.5 | Queue builder | `queue.ts`: query `card_states` for all cards where `due ≤ now`. Sort: overdue review cards first (by days overdue, descending), then learning/relearning cards, then new cards up to the daily limit. |
| 2.6 | Daily new card limit | Read `new_cards_per_day` from `settings` (default: 20). Count new cards already seen today via `review_logs`. Cap accordingly. |
| 2.7 | Rating flow | Given a card and a rating (1–4): call the scheduler, update `card_states`, update `cards.card_type`, insert a `review_logs` row. All in a single transaction. |
| 2.8 | Undo (P1) | Store the previous `card_states` + `review_logs` entry in memory. Undo reverts the transaction. Single-level only within the current session. |
| 2.9 | Custom parameters (P1) | Settings UI for pasting FSRS weights (`w[]` array) and `request_retention`. Pass to the ts-fsrs instance. |
| 2.10 | Test | Unit tests for: new card graduation, lapse recovery, queue ordering, daily limit enforcement, interval accuracy against known FSRS-5 outputs. |

**[FUTURE] Why this matters:** The `Scheduler` interface means SM-2 support is a new file, not a rewrite. The queue builder is already structured to accommodate future activity types (phoneme drills, writing exercises) by adding new queue sources alongside card reviews.

---

### Phase 3 — Review Interface
**Duration: 5–7 days**
**Goal: User can study a deck — see cards, flip, rate, and complete a session.**

| # | Task | Detail |
|---|---|---|
| 3.1 | Deck browser | `DeckBrowser.tsx`: list all decks with card counts (new / learning / due). Nest sub-decks under parents. Click a deck to start a session. |
| 3.2 | Review session state | `review-store.ts`: initialise with the queue for the selected deck. Track current card index, session stats (cards reviewed, time started, ratings given). |
| 3.3 | Card front display | `CardFace.tsx`: render the card's front template. Parse Anki HTML through DOMPurify. Resolve media references (`<img src="filename.jpg">`) to IndexedDB blob URLs via `adapter.files.getMediaUrl()`. |
| 3.4 | Card flip | Spacebar or click/tap reveals the back. Animate with a CSS transition. No hover-dependent states — the reveal trigger must work identically with touch and mouse. **[FUTURE: iOS]** |
| 3.5 | Rating bar | `RatingBar.tsx`: show Again / Hard / Good / Easy. Each button displays the projected next interval (calculated by calling the scheduler in preview mode). Buttons must be ≥ 44px tall with adequate spacing for thumb targets. **[FUTURE: iOS]** |
| 3.6 | Commit rating | On button click: run the rating flow from Phase 2, advance to the next card in the queue. If a learning card is re-queued within the session (e.g., 1m step), insert it back into the queue at the right position. |
| 3.7 | Session header | `SessionHeader.tsx`: show remaining counts — new (blue), learning (orange), review (green). Update in real time as cards are rated. |
| 3.8 | Session complete | `SessionComplete.tsx`: show cards reviewed, time taken, retention rate for the session. Button to return to deck browser. |
| 3.9 | Audio playback | `useAudio.ts` hook: detect `[sound:filename.mp3]` tags in card content. Auto-play on card display. Replay button. Resolve audio files from IndexedDB blobs → object URLs. Note: auto-play must be triggered by a user gesture (tap/click) to work in Safari and WKWebView — do not rely on programmatic play without interaction. **[FUTURE: iOS]** |
| 3.10 | Keyboard shortcuts | `useKeyboard.ts` hook: spacebar → flip/reveal, 1/2/3/4 → Again/Hard/Good/Easy (only after reveal), Ctrl+Z → undo. |
| 3.11 | Test | Full end-to-end: import a deck, start a session, review 20 cards, verify database state matches expected FSRS outputs. Test keyboard-only flow. Test with audio and image cards. |

**[FUTURE] Why this matters:** The review session is just one *activity type*. The shell and routing are built so that future activities (phoneme drill, writing exercise, AI reading comprehension) are peer routes alongside review — not shoehorned into the card review flow.

---

### Phase 4 — Statistics and Polish
**Duration: 3–5 days**
**Goal: Usable daily-driver with stats, persistence safety, and export.**

| # | Task | Detail |
|---|---|---|
| 4.1 | Today summary | Query `review_logs` for today: cards reviewed, new cards seen, average `elapsed_ms`, retention rate (Good + Easy / total reviews). Display in a dashboard component. |
| 4.2 | Card state counts | Query `cards` grouped by `card_type` + interval thresholds: new, learning, young (< 21d), mature (≥ 21d), suspended. Show as a summary bar or table. |
| 4.3 | Review history chart (P1) | Bar chart of daily review counts over the last 30 days, segmented by rating. Use a lightweight charting library (recharts or Chart.js via a canvas). |
| 4.4 | Forecast (P1) | Project due cards per day for the next 30 days by scanning `card_states.due`. Display as a line or bar chart. |
| 4.5 | Retention rate (P1) | Rolling 30-day retention: (Good + Easy reviews) / total reviews over the window. Show as a single stat and trend line. |
| 4.6 | Export / backup | Export the current sql.js database binary + all media blobs from IndexedDB as a downloadable `.zip` file. This is the user's data safety net. |
| 4.7 | Import from backup | Accept a previously exported `.zip`, restore the database and media. |
| 4.8 | Persistence health | On launch, if `navigator.storage.persisted()` returns false, show a gentle banner: "Your data is stored in this browser. Grant storage permission or export a backup to keep it safe." |
| 4.9 | Night mode polish | Ensure all components render correctly in dark mode. Test contrast ratios. |
| 4.10 | Session timer (P1) | Elapsed time display in the session header. |
| 4.11 | Settings panel | Centralised settings: daily new card limit, learning steps, relearning steps, FSRS weights, dark mode preference. Stored in the `settings` table. |
| 4.12 | Error handling | Graceful handling of: corrupted .apkg files, media files that fail to load, database write failures, IndexedDB quota exceeded. User-facing error messages, not console errors. |
| 4.13 | Performance audit | Test with a large deck (10k+ cards). Profile WASM DB query times, media load times, render performance. Optimise if outside targets. |
| 4.14 | Responsive and touch audit | Test all flows at 375px, 390px, and 428px widths (iPhone SE, 15, 15 Pro Max). Verify: all touch targets ≥ 44px, no content overflow, no hover-only interactions, rating buttons easily thumb-reachable. Fix any issues. **[FUTURE: iOS]** |

---

## 4. Milestone Summary

| Milestone | What's Working | Estimated Duration |
|---|---|---|
| **Phase 0 complete** | Empty app loads, database initialises and persists, dark mode toggle works. | 2–3 days |
| **Phase 1 complete** | User can import an .apkg file. Decks, cards, and media are in the database. | 5–7 days |
| **Phase 2 complete** | FSRS scheduling works. Queue builds correctly. Rating updates card state. | 4–5 days |
| **Phase 3 complete** | Full review session: flip cards, rate, hear audio, complete session. Keyboard-driven. | 5–7 days |
| **Phase 4 complete** | Stats dashboard, export/import backup, settings, error handling, polish. **MVP is shippable.** | 3–5 days |
| **Total** | | **~4–6 weeks** |

These are working-time estimates for a solo developer. They assume some iteration and debugging but not major research spikes. The .apkg parser (Phase 1) and the FSRS engine integration (Phase 2) are the highest-risk phases — if either takes longer than expected, it will be here.

---

## 5. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Anki .apkg format variations** — different Anki versions produce different SQLite schemas and template syntax. | High | Medium | Test against multiple .apkg files early (Phase 1). Start with the modern `collection.anki21` format. Handle `collection.anki2` as a fallback. Log and skip unparseable cards rather than failing the entire import. |
| **sql.js performance on large decks** — WASM SQLite may be slow for 100k+ card collections. | Medium | Medium | Index all query-hot columns (done in schema). Profile in Phase 4. If unacceptable, consider OPFS-backed sql.js for better persistence performance. The Electron migration eliminates this entirely. |
| **Browser storage eviction** — IndexedDB data can be cleared by the browser or user. | Medium | High | Request persistent storage on first launch. Show clear warnings if not granted. Export/backup feature is P0 in Phase 4. |
| **Anki card template complexity** — some community decks use advanced CSS, JavaScript, or Anki add-on features in templates. | Medium | Low | DOMPurify strips scripts. Support standard template syntax only. Degrade gracefully — show raw field content if a template can't be parsed. |
| **Audio playback from blob URLs** — some browsers may have quirks with audio playback from IndexedDB-backed object URLs. | Low | Medium | Test in Chrome, Firefox, Safari early. Fall back to base64 data URLs if blob URLs fail. |
| **WKWebView API gaps** — Capacitor runs in WKWebView, which lacks some Web APIs (File System Access API, `navigator.storage.persist()`, some IndexedDB behaviours). | Medium | Medium | Never depend on the File System Access API without a fallback — the MVP already uses `<input type="file">` as the primary picker. Avoid `navigator.storage.persist()` as a hard requirement (it's a nice-to-have prompt, not a gate). Test IndexedDB persistence behaviour in Safari regularly, since Safari's WKWebView is the Capacitor runtime. **[FUTURE: iOS]** |
| **iOS auto-play restrictions** — WKWebView blocks audio auto-play without a user gesture. | Low | Low | The MVP review flow already requires a tap/click to reveal the card back. Bind audio playback to that gesture. Documented in Phase 3, task 3.9. **[FUTURE: iOS]** |

---

## 6. Definition of Done (MVP)

The MVP is shippable when all of the following are true:

- A user can open the app in Chrome, Firefox, or Safari and import a .apkg file
- Decks display in a browser with correct hierarchy and card counts
- Review sessions present cards with rendered HTML, images, and audio
- FSRS scheduling produces correct intervals (verified against ts-fsrs reference outputs)
- Learning steps and lapse handling work as specified
- Keyboard shortcuts drive the entire review flow without needing a mouse
- Data persists across browser sessions (IndexedDB)
- Export/backup produces a downloadable ZIP that can be re-imported
- Today's stats display accurately after a review session
- Dark mode works across all views
- No console errors during normal operation
- Performance meets web targets from the MVP PRD (3s launch, 50ms flip, 200ms queue query)
- All views are usable at 375px viewport width with touch-only interaction (no hover dependencies, ≥ 44px touch targets)

---

## 7. What Comes After the MVP

This is not part of the build plan, but is included for orientation. After the MVP ships, features are added to the same web codebase in roughly this order (subject to research and user feedback):

1. **Card creation and editing** — create cards natively, not just via .apkg import
2. **Phoneme training module** — minimal pair exercises, audio playback, the first non-SRS activity type
3. **AI content engine** — AI-generated reading passages, quizzes, image cards (requires an API key or backend proxy)
4. **Audio shadowing** — record-and-compare pronunciation exercises
5. **Writing practice** — stroke-order input for Japanese scripts
6. **User accounts and cloud sync** — authentication, remote database, cross-device progress
7. **Statistics v2** — progress dashboard, estimated time to fluency, curriculum milestones
8. **Electron migration** — wrap the mature app in Electron, swap the platform adapter
9. **iOS release via Capacitor** — wrap the same app in Capacitor, swap the platform adapter, submit to App Store

The Figma MCP remains available throughout steps 1–7 because the app is still running in the browser. Steps 8 and 9 happen last, once the UI is stable and the design iteration loop no longer needs browser DevTools access. The Electron and Capacitor migrations can happen in parallel or in either order — they are independent.

### 7.1 Why Capacitor, Not Native Swift

The iOS app will be built with Capacitor (a web-to-native bridge), not as a native Swift application. This is a deliberate choice driven by the project's constraints:

**Capacitor** wraps the existing React app in a native iOS shell (WKWebView). The UI code, Zustand stores, ts-fsrs scheduling, card rendering, and import pipeline all ship unchanged. You write one new file — `platform/capacitor.ts` — that implements the platform adapter using Capacitor's SQLite and Filesystem plugins. The app is submitted to the App Store as a standard native binary.

**Native Swift** would mean building a second app from scratch: new UI (SwiftUI or UIKit), new state management, a new FSRS implementation (fsrs-swift or Rust FFI bindings), a new .apkg parser, a new card renderer. Every feature added to the web app would need to be re-implemented in Swift. For a solo developer, this doubles the maintenance surface permanently.

The tradeoff is that a Capacitor app won't feel as native as a purpose-built Swift app — transitions, scroll physics, and system integration (widgets, Shortcuts, ShareSheet) will be limited. But for an SRS review tool where the core interaction is "see card → tap → rate," the difference is minimal. If native feel becomes a priority later (e.g., for writing practice with Apple Pencil), individual screens can be implemented as native Swift views within the Capacitor shell — you don't have to go all-or-nothing.

---

*End of Document*
