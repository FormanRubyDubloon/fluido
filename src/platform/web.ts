import { get, set, del, keys } from "idb-keyval";
import JSZip from "jszip";
import type { DbAdapter, FileAdapter, PlatformAdapter } from "./adapter";
import { IDB_DATABASE_KEY, IDB_MEDIA_PREFIX } from "@/lib/constants";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlJsDatabase = any;

const IDB_FILE_HANDLE_KEY = "fluido-file-handle";

// ---------------------------------------------------------------------------
// Database Adapter
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const opts = { mode: "readwrite" } as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const permission = await (handle as any).queryPermission(opts);
      if (permission !== "granted") {
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
      // Fall back
    }
    return false;
  }

  async linkSaveFile(): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = await (window as any).showSaveFilePicker({
      suggestedName: "fluido.db",
      types: [{ description: "SQLite Database", accept: { "application/x-sqlite3": [".db"] } }],
    });
    this.fileHandle = handle;
    await set(IDB_FILE_HANDLE_KEY, handle);
    await this.persistToFile();
    return handle.name;
  }

  async getSaveFileStatus(): Promise<{ linked: boolean; name: string | null; needsPermission: boolean }> {
    try {
      const handle = await get<FileSystemFileHandle>(IDB_FILE_HANDLE_KEY);
      if (!handle) return { linked: false, name: null, needsPermission: false };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const permission = await (handle as any).queryPermission({ mode: "readwrite" });
      this.fileHandle = handle;
      return { linked: true, name: handle.name, needsPermission: permission !== "granted" };
    } catch {
      return { linked: false, name: null, needsPermission: false };
    }
  }

  async requestFilePermission(): Promise<boolean> {
    if (!this.fileHandle) return false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const permission = await (this.fileHandle as any).requestPermission({ mode: "readwrite" });
      if (permission === "granted") {
        const file = await this.fileHandle.getFile();
        const buffer = await file.arrayBuffer();
        if (buffer.byteLength > 0) {
          const sqlJsModule = await import("sql.js");
          const initSqlJs = typeof sqlJsModule.default === "function" ? sqlJsModule.default : sqlJsModule;
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
    } catch { /* denied */ }
    return false;
  }

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
    await set(IDB_DATABASE_KEY, data);

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
      await this.persistToFile();
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
// File Adapter — lazy media loading from cloud
// ---------------------------------------------------------------------------

function mediaKey(deckId: string, filename: string): string {
  return `${IDB_MEDIA_PREFIX}:${deckId}/${filename}`;
}

// Cache of in-flight downloads to avoid duplicate requests for the same file
const inflight = new Map<string, Promise<string>>();

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

    // 1. Check local IndexedDB
    try {
      const data = await get<Uint8Array>(key);
      if (data) {
        return createBlobUrl(filename, data);
      }
    } catch {
      // IndexedDB error — try cloud
    }

    // 2. Try cloud if configured
    if (isSupabaseConfigured()) {
      // Deduplicate in-flight requests
      if (inflight.has(key)) {
        return inflight.get(key)!;
      }

      const promise = this.fetchFromCloud(deckId, filename, key);
      inflight.set(key, promise);

      try {
        const url = await promise;
        return url;
      } finally {
        inflight.delete(key);
      }
    }

    return "";
  }

  private async fetchFromCloud(deckId: string, filename: string, localKey: string): Promise<string> {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) return "";

      const storagePath = `${userId}/${deckId}/${filename}`;

      const { data, error } = await supabase.storage
        .from("media")
        .download(storagePath);

      if (error || !data) return "";

      const buffer = await data.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // Cache locally for next time (fire and forget)
      set(localKey, bytes).catch(() => {});

      return createBlobUrl(filename, bytes);
    } catch {
      return "";
    }
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

function createBlobUrl(filename: string, data: Uint8Array): string {
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