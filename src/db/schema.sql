-- Fluido SRS — Database Schema v1
-- All primary keys are TEXT (UUIDs) for future sync compatibility.
-- All mutable tables carry created_at and updated_at.

CREATE TABLE IF NOT EXISTS decks (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  parent_id   TEXT REFERENCES decks(id),
  language    TEXT,
  source      TEXT NOT NULL DEFAULT 'anki',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS note_types (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  fields          TEXT NOT NULL,           -- JSON array of field names
  card_templates  TEXT NOT NULL,           -- JSON array of {front, back, css}
  source          TEXT NOT NULL DEFAULT 'anki',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id            TEXT PRIMARY KEY,
  note_type_id  TEXT NOT NULL REFERENCES note_types(id),
  fields        TEXT NOT NULL,             -- JSON object {fieldName: value}
  tags          TEXT NOT NULL DEFAULT '[]', -- JSON array
  source        TEXT NOT NULL DEFAULT 'anki',
  source_id     TEXT,                      -- Original Anki note ID for dedup
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cards (
  id              TEXT PRIMARY KEY,
  note_id         TEXT NOT NULL REFERENCES notes(id),
  deck_id         TEXT NOT NULL REFERENCES decks(id),
  template_index  INTEGER NOT NULL,
  card_type       TEXT NOT NULL DEFAULT 'new',
  source          TEXT NOT NULL DEFAULT 'anki',
  suspended       INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS card_states (
  card_id       TEXT PRIMARY KEY REFERENCES cards(id),
  difficulty    REAL NOT NULL,
  stability     REAL NOT NULL,
  due           TEXT NOT NULL,
  interval      REAL NOT NULL,
  reps          INTEGER NOT NULL DEFAULT 0,
  lapses        INTEGER NOT NULL DEFAULT 0,
  last_review   TEXT,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS review_logs (
  id              TEXT PRIMARY KEY,
  card_id         TEXT NOT NULL REFERENCES cards(id),
  rating          INTEGER NOT NULL,
  elapsed_ms      INTEGER NOT NULL,
  review_time     TEXT NOT NULL,
  scheduled_days  REAL NOT NULL,
  actual_days     REAL,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- Performance indices
CREATE INDEX IF NOT EXISTS idx_cards_deck       ON cards(deck_id);
CREATE INDEX IF NOT EXISTS idx_cards_type       ON cards(card_type);
CREATE INDEX IF NOT EXISTS idx_cards_note       ON cards(note_id);
CREATE INDEX IF NOT EXISTS idx_card_states_due  ON card_states(due);
CREATE INDEX IF NOT EXISTS idx_review_logs_card ON review_logs(card_id);
CREATE INDEX IF NOT EXISTS idx_review_logs_time ON review_logs(review_time);
CREATE INDEX IF NOT EXISTS idx_notes_source_id  ON notes(source_id);
