import { get, set, keys, del } from "idb-keyval";
import JSZip from "jszip";
import type { DbAdapter, FileAdapter, PlatformAdapter } from "./adapter";
import { IDB_DATABASE_KEY, IDB_MEDIA_PREFIX } from "@/lib/constants";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlJsDatabase = any;

const IDB_FILE_HANDLE_KEY = "fluido-file-handle";

// ---------------------------------------------------------------------------
// Database Adapter (sql.js / WASM) with File System Access API persistence
// ---------------------------------------------------------------------------

class WebDbAdapter implements DbAdapter {
  private db: SqlJsDatabase = null;
  private fileHandle: FileSystemFileHandle | null = null;
  private persistTimeout: ReturnType<typeof setTimeout> | null = null;

  async open(): Promise<void> {
    if (this.db) return;

    const sqlJsModule = await import("sql.js");
    const initSqlJs = typeof sqlJsModule.default === "function"
      ? sqlJsModule.default
      : sqlJsModule;

    const wasmResponse = await fetch("/sql-wasm.wasm");
    const wasmBinary = await wasmResponse.arrayBuffer();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SQL = await (initSqlJs as any)({ wasmBinary });

    // Try to restore from linked file first, then fall back to IndexedDB
    const restored = await this.tryRestoreFromFile(SQL);
    if (!restored) {
      const persisted = await get<Uint8Array>(IDB_DATABASE_KEY);
      if (persisted) {
        this.db = new SQL.Database(persisted);
      } else {
        this.db = new SQL.Database();
      }
    }
  }

  private async tryRestoreFromFile(SQL: unknown): Promise<boolean> {
    try {
      const handle = await get<FileSystemFileHandle>(IDB_FILE_HANDLE_KEY);
      if (!handle) return false;

      // Verify we still have permission
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const opts = { mode: "readwrite" } as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const permission = await (handle as any).queryPermission(opts);
      if (permission !== "granted") {
        // Will need to re-request — store handle for later
        this.fileHandle = handle;
        return false;
      }

      const file = await handle.getFile();
      const buffer = await file.arrayBuffer();
      if (buffer.byteLength > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.db = new (SQL as any).Database(new Uint8Array(buffer));
        this.fileHandle = handle;
        return true;
      }
    } catch {
      // File handle expired or invalid — fall back
    }
    return false;
  }

  /**
   * Link a file on disk for auto-saving.
   * Must be called from a user gesture (click handler).
   */
  async linkSaveFile(): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = await (window as any).showSaveFilePicker({
      suggestedName: "fluido.db",
      types: [
        {
          description: "SQLite Database",
          accept: { "application/x-sqlite3": [".db"] },
        },
      ],
    });

    this.fileHandle = handle;
    await set(IDB_FILE_HANDLE_KEY, handle);

    // Write current database to the file immediately
    await this.persistToFile();

    return handle.name;
  }

  /**
   * Check if a save file is linked.
   */
  async getSaveFileStatus(): Promise<{ linked: boolean; name: string | null; needsPermission: boolean }> {
    try {
      const handle = await get<FileSystemFileHandle>(IDB_FILE_HANDLE_KEY);
      if (!handle) return { linked: false, name: null, needsPermission: false };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const permission = await (handle as any).queryPermission({ mode: "readwrite" });
      this.fileHandle = handle;

      return {
        linked: true,
        name: handle.name,
        needsPermission: permission !== "granted",
      };
    } catch {
      return { linked: false, name: null, needsPermission: false };
    }
  }

  /**
   * Re-request permission for a previously linked file.
   * Must be called from a user gesture.
   */
  async requestFilePermission(): Promise<boolean> {
    if (!this.fileHandle) return false;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const permission = await (this.fileHandle as any).requestPermission({ mode: "readwrite" });
      if (permission === "granted") {
        // Restore from file
        const file = await this.fileHandle.getFile();
        const buffer = await file.arrayBuffer();
        if (buffer.byteLength > 0) {
          const sqlJsModule = await import("sql.js");
          const initSqlJs = typeof sqlJsModule.default === "function"
            ? sqlJsModule.default
            : sqlJsModule;
          const wasmResponse = await fetch("/sql-wasm.wasm");
          const wasmBinary = await wasmResponse.arrayBuffer();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const SQL = await (initSqlJs as any)({ wasmBinary });
          if (this.db) this.db.close();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          this.db = new (SQL as any).Database(new Uint8Array(buffer));
        }
        return true;
      }
    } catch {
      // Permission denied
    }
    return false;
  }

  /**
   * Unlink the save file.
   */
  async unlinkSaveFile(): Promise<void> {
    this.fileHandle = null;
    await del(IDB_FILE_HANDLE_KEY);
  }

  exec<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    const db = this.getDb();
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return rows;
  }

  run(sql: string, params: unknown[] = []): void {
    const db = this.getDb();
    if (params.length === 0) {
      db.exec(sql);
    } else {
      db.run(sql, params);
    }
  }

  transaction(fn: () => void): void {
    const db = this.getDb();
    db.run("BEGIN TRANSACTION");
    try {
      fn();
      db.run("COMMIT");
    } catch (e) {
      db.run("ROLLBACK");
      throw e;
    }
  }

  async persist(): Promise<void> {
    const db = this.getDb();
    const data = db.export();

    // Always save to IndexedDB as fallback
    await set(IDB_DATABASE_KEY, data);

    // Debounced save to file (avoids writing on every single card)
    if (this.fileHandle) {
      if (this.persistTimeout) clearTimeout(this.persistTimeout);
      this.persistTimeout = setTimeout(() => this.persistToFile(), 500);
    }
  }

  private async persistToFile(): Promise<void> {
    if (!this.fileHandle || !this.db) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const permission = await (this.fileHandle as any).queryPermission({ mode: "readwrite" });
      if (permission !== "granted") return;

      const data = this.db.export();
      const writable = await this.fileHandle.createWritable();
      await writable.write(data);
      await writable.close();
    } catch (e) {
      console.warn("Failed to save to file:", e);
    }
  }

  async close(): Promise<void> {
    if (this.persistTimeout) {
      clearTimeout(this.persistTimeout);
      await this.persistToFile(); // Final flush
    }
    if (this.db) {
      await this.persist();
      this.db.close();
      this.db = null;
    }
  }

  private getDb(): SqlJsDatabase {
    if (!this.db) throw new Error("Database not opened. Call open() first.");
    return this.db;
  }
}

// ---------------------------------------------------------------------------
// File Adapter (IndexedDB blobs)
// ---------------------------------------------------------------------------

function mediaKey(deckId: string, filename: string): string {
  return `${IDB_MEDIA_PREFIX}:${deckId}/${filename}`;
}

class WebFileAdapter implements FileAdapter {
  async pickApkgFile(): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".apkg";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) { reject(new Error("No file selected")); return; }
        resolve(await file.arrayBuffer());
      };
      input.oncancel = () => reject(new Error("File picker cancelled"));
      input.click();
    });
  }

  async storeMedia(deckId: string, filename: string, data: Uint8Array): Promise<string> {
    const key = mediaKey(deckId, filename);
    await set(key, data);
    return key;
  }

  async getMediaUrl(deckId: string, filename: string): Promise<string> {
    const key = mediaKey(deckId, filename);
    const data = await get<Uint8Array>(key);
    if (!data) return "";

    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const mimeMap: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
      webp: "image/webp", svg: "image/svg+xml", mp3: "audio/mpeg", ogg: "audio/ogg",
      wav: "audio/wav", mp4: "video/mp4", ttf: "font/ttf", ttc: "font/collection", otf: "font/otf",
    };
    const mime = mimeMap[ext] ?? "application/octet-stream";
    const blob = new Blob([new Uint8Array(data)], { type: mime });
    return URL.createObjectURL(blob);
  }

  async exportBackup(): Promise<void> {
    const zip = new JSZip();

    const dbBinary = await get<Uint8Array>(IDB_DATABASE_KEY);
    if (dbBinary) zip.file("fluido.db", dbBinary);

    const allKeys = await keys();
    const mediaKeys = (allKeys as string[]).filter(
      (k) => typeof k === "string" && k.startsWith(IDB_MEDIA_PREFIX)
    );
    for (const key of mediaKeys) {
      const data = await get<Uint8Array>(key);
      if (data) {
        const path = key.replace(`${IDB_MEDIA_PREFIX}:`, "media/");
        zip.file(path, data);
      }
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fluido-backup-${new Date().toISOString().split("T")[0]}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async importBackup(): Promise<void> {
    throw new Error("Import from backup not yet implemented");
  }
}

// ---------------------------------------------------------------------------
// Assemble
// ---------------------------------------------------------------------------

export function createWebAdapter(): PlatformAdapter {
  return {
    db: new WebDbAdapter(),
    files: new WebFileAdapter(),
    platform: "web",
  };
}