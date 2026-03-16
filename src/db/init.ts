import { getDb } from "@/platform/adapter";
import {
  SCHEMA_VERSION,
  DEFAULT_NEW_CARDS_PER_DAY,
  DEFAULT_LEARNING_STEPS,
  DEFAULT_RELEARNING_STEPS,
} from "@/lib/constants";
import schema from "./schema.sql?raw";

/**
 * Initialise the database: run schema, check version, seed defaults.
 * Called once at app startup after the adapter is opened.
 */
export async function initDatabase(): Promise<void> {
  const db = getDb();

  // Run the full schema (all CREATE IF NOT EXISTS, so safe to re-run)
  db.run(schema);

  // Check schema version
  const rows = db.exec<{ value: string }>(
    "SELECT value FROM settings WHERE key = ?",
    ["schema_version"]
  );

  const currentVersion = rows[0]
    ? parseInt(rows[0].value, 10)
    : 0;

  if (currentVersion === 0) {
    // First run — seed default settings
    seedDefaults();
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "schema_version",
      String(SCHEMA_VERSION),
    ]);
  } else if (currentVersion < SCHEMA_VERSION) {
    // Future: run migrations in order
    runMigrations(currentVersion, SCHEMA_VERSION);
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      "schema_version",
      String(SCHEMA_VERSION),
    ]);
  }

  // Persist after init
  await db.persist();
}

function seedDefaults(): void {
  const db = getDb();
  const defaults: [string, unknown][] = [
    ["new_cards_per_day", DEFAULT_NEW_CARDS_PER_DAY],
    ["learning_steps", DEFAULT_LEARNING_STEPS],
    ["relearning_steps", DEFAULT_RELEARNING_STEPS],
    ["dark_mode", false],
    ["fsrs_weights", null], // null = use FSRS-5 defaults
    ["request_retention", 0.9],
  ];

  for (const [key, value] of defaults) {
    db.run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", [
      key,
      JSON.stringify(value),
    ]);
  }
}

function runMigrations(_from: number, _to: number): void {
  // Future: iterate migration files in src/db/migrations/
  // For now, no migrations exist beyond v1.
}
