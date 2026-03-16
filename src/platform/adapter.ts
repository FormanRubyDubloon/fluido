/**
 * Platform Adapter Interface
 *
 * Every database query and file operation in the app goes through this interface.
 * The web build imports the web adapter (sql.js + IndexedDB).
 * The Electron build will import an Electron adapter (better-sqlite3 + fs).
 * The Capacitor build will import a Capacitor adapter (@capacitor-community/sqlite + Filesystem).
 *
 * Application code NEVER calls sql.js, better-sqlite3, IndexedDB, or fs directly.
 */

export interface DbAdapter {
  /** Initialise the database (load WASM, open file, run migrations) */
  open(): Promise<void>;

  /** Execute a read query. Returns an array of row objects. */
  exec<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): T[];

  /** Execute a write query (INSERT, UPDATE, DELETE). Returns nothing. */
  run(sql: string, params?: unknown[]): void;

  /** Execute multiple statements in a single transaction. */
  transaction(fn: () => void): void;

  /** Persist the current database state (web: write to IndexedDB) */
  persist(): Promise<void>;

  /** Close the database connection and release resources */
  close(): Promise<void>;
}

export interface FileAdapter {
  /** Prompt the user to pick an .apkg file. Returns the raw bytes. */
  pickApkgFile(): Promise<ArrayBuffer>;

  /** Store a media blob. Returns a key that can be used to retrieve it. */
  storeMedia(
    deckId: string,
    filename: string,
    data: Uint8Array
  ): Promise<string>;

  /** Get a URL (blob: or file://) for a stored media file. */
  getMediaUrl(deckId: string, filename: string): Promise<string>;

  /** Export the full database + media as a downloadable backup. */
  exportBackup(): Promise<void>;

  /** Import a previously exported backup. */
  importBackup(data: ArrayBuffer): Promise<void>;
}

export interface PlatformAdapter {
  readonly db: DbAdapter;
  readonly files: FileAdapter;

  /** Human-readable platform name for debugging */
  readonly platform: "web" | "electron" | "capacitor";
}

/**
 * Singleton reference to the active platform adapter.
 * Set once at app startup via initPlatform().
 */
let _adapter: PlatformAdapter | null = null;

export function initPlatform(adapter: PlatformAdapter): void {
  if (_adapter) return;
  _adapter = adapter;
}

export function getAdapter(): PlatformAdapter {
  if (!_adapter) {
    throw new Error(
      "Platform adapter not initialised. Call initPlatform() at app startup."
    );
  }
  return _adapter;
}

export function getDb(): DbAdapter {
  return getAdapter().db;
}

export function getFiles(): FileAdapter {
  return getAdapter().files;
}
