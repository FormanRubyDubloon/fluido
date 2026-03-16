export interface AnkiNoteType {
  id: number;
  name: string;
  fields: { name: string; ord: number }[];
  templates: { name: string; qfmt: string; afmt: string; ord: number }[];
  css: string;
}

export interface AnkiDeck {
  id: number;
  name: string;
}

export interface AnkiNote {
  id: number;
  mid: number;
  fields: string[];
  tags: string[];
}

export interface AnkiCard {
  id: number;
  nid: number;
  did: number;
  ord: number;
  type: number;
  queue: number;
  due: number;
  ivl: number;
  factor: number;
  reps: number;
  lapses: number;
}

export interface AnkiRevlogEntry {
  id: number;
  cid: number;
  ease: number;
  ivl: number;
  lastIvl: number;
  time: number;
  type: number;
}

export interface AnkiCollection {
  noteTypes: AnkiNoteType[];
  decks: AnkiDeck[];
  notes: AnkiNote[];
  cards: AnkiCard[];
  revlog: AnkiRevlogEntry[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlJsDatabase = any;

async function openAnkiDb(binary: Uint8Array): Promise<SqlJsDatabase> {
  const sqlJsModule = await import("sql.js");
  const initSqlJs = typeof sqlJsModule.default === "function"
    ? sqlJsModule.default
    : sqlJsModule;

  const wasmResponse = await fetch("/sql-wasm.wasm");
  const wasmBinary = await wasmResponse.arrayBuffer();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SQL = await (initSqlJs as any)({ wasmBinary });
  const db = new SQL.Database(binary);

  // Register a dummy "unicase" collation (used in modern Anki databases)
  try {
    db.create_collation("unicase", (a: string, b: string) => {
      const al = a.toLowerCase();
      const bl = b.toLowerCase();
      if (al < bl) return -1;
      if (al > bl) return 1;
      return 0;
    });
  } catch {
    // Older sql.js may not support create_collation — queries will still
    // work as long as they don't ORDER BY a unicase column
  }

  return db;
}

function query(db: SqlJsDatabase, sql: string): Record<string, unknown>[] {
  try {
    const stmt = db.prepare(sql);
    const rows: Record<string, unknown>[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  } catch (e) {
    console.warn(`Query failed: ${sql}`, e);
    return [];
  }
}

function tableExists(db: SqlJsDatabase, name: string): boolean {
  const rows = query(
    db,
    `SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Protobuf helpers (for modern Anki config blobs)
// ---------------------------------------------------------------------------

function readVarint(data: Uint8Array, idx: number): [number, number] {
  let val = 0;
  let shift = 0;
  while (idx < data.length) {
    const b = data[idx]!;
    idx++;
    val |= (b & 0x7f) << shift;
    shift += 7;
    if (!(b & 0x80)) break;
  }
  return [val, idx];
}

function parseProtobufStrings(data: Uint8Array): Map<number, string> {
  const fields = new Map<number, string>();
  let idx = 0;
  while (idx < data.length) {
    const tag = data[idx]!;
    const fieldNum = tag >> 3;
    const wireType = tag & 0x07;
    idx++;

    if (wireType === 2) {
      let length: number;
      [length, idx] = readVarint(data, idx);
      const value = data.slice(idx, idx + length);
      idx += length;
      try {
        fields.set(fieldNum, new TextDecoder().decode(value));
      } catch {
        // Binary field — skip
      }
    } else if (wireType === 0) {
      [, idx] = readVarint(data, idx);
    } else {
      break;
    }
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Modern format (Anki 2.1.50+)
// ---------------------------------------------------------------------------

function parseNoteTypesModern(db: SqlJsDatabase): AnkiNoteType[] {
  const ntRows = query(db, "SELECT id, name, config FROM notetypes");

  return ntRows.map((nt) => {
    const ntId = Number(nt.id);
    const name = nt.name as string;

    // Extract CSS from notetypes config protobuf (field 3)
    let css = "";
    if (nt.config instanceof Uint8Array) {
      const configFields = parseProtobufStrings(nt.config);
      css = configFields.get(3) ?? "";
    }

    // Fields from the `fields` table
    const fieldRows = query(
      db,
      `SELECT name, ord FROM fields WHERE ntid = ${ntId} ORDER BY ord ASC`
    );
    const fields = fieldRows.map((f) => ({
      name: f.name as string,
      ord: Number(f.ord),
    }));

    // Templates from the `templates` table (config blob has qfmt/afmt)
    const tmplRows = query(
      db,
      `SELECT name, ord, config FROM templates WHERE ntid = ${ntId} ORDER BY ord ASC`
    );
    const templates = tmplRows.map((t) => {
      let qfmt = "";
      let afmt = "";

      // Check if qfmt/afmt are direct columns (some versions)
      if (typeof t.qfmt === "string") {
        qfmt = t.qfmt;
        afmt = (t.afmt as string) ?? "";
      } else if (t.config instanceof Uint8Array) {
        // Parse from protobuf config: field 1 = qfmt, field 2 = afmt
        const configFields = parseProtobufStrings(t.config);
        qfmt = configFields.get(1) ?? "";
        afmt = configFields.get(2) ?? "";
      }

      return {
        name: t.name as string,
        ord: Number(t.ord),
        qfmt,
        afmt,
      };
    });

    return { id: ntId, name, fields, templates, css };
  });
}

function parseDecksModern(db: SqlJsDatabase): AnkiDeck[] {
  const rows = query(db, "SELECT id, name FROM decks");
  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name as string,
  }));
}

// ---------------------------------------------------------------------------
// Legacy format
// ---------------------------------------------------------------------------

function parseNoteTypesFromCol(db: SqlJsDatabase): AnkiNoteType[] {
  const rows = query(db, "SELECT models FROM col LIMIT 1");
  if (rows.length === 0) return [];

  const modelsJson = rows[0]!.models as string;
  if (!modelsJson) return [];

  let models: Record<string, RawAnkiModel>;
  try {
    models = JSON.parse(modelsJson);
  } catch {
    return [];
  }

  if (!models || Object.keys(models).length === 0) return [];

  return Object.values(models).map((m) => ({
    id: Number(m.id),
    name: m.name,
    fields: (m.flds || [])
      .sort((a: { ord: number }, b: { ord: number }) => a.ord - b.ord)
      .map((f: { name: string; ord: number }) => ({
        name: f.name,
        ord: f.ord,
      })),
    templates: (m.tmpls || [])
      .sort((a: { ord: number }, b: { ord: number }) => a.ord - b.ord)
      .map((t: { name: string; qfmt: string; afmt: string; ord: number }) => ({
        name: t.name,
        qfmt: t.qfmt,
        afmt: t.afmt,
        ord: t.ord,
      })),
    css: m.css || "",
  }));
}

function parseDecksFromCol(db: SqlJsDatabase): AnkiDeck[] {
  const rows = query(db, "SELECT decks FROM col LIMIT 1");
  if (rows.length === 0) return [];

  const decksJson = rows[0]!.decks as string;
  if (!decksJson) return [];

  let decks: Record<string, { id: number; name: string }>;
  try {
    decks = JSON.parse(decksJson);
  } catch {
    return [];
  }

  if (!decks || Object.keys(decks).length === 0) return [];

  return Object.values(decks).map((d) => ({
    id: Number(d.id),
    name: d.name,
  }));
}

// ---------------------------------------------------------------------------
// Notes, Cards, Revlog (same in both formats)
// ---------------------------------------------------------------------------

function parseNotes(db: SqlJsDatabase): AnkiNote[] {
  const rows = query(db, "SELECT id, mid, flds, tags FROM notes");
  return rows.map((row) => ({
    id: Number(row.id),
    mid: Number(row.mid),
    fields: (row.flds as string).split("\x1f"),
    tags: (row.tags as string).trim().split(/\s+/).filter(Boolean),
  }));
}

function parseCards(db: SqlJsDatabase): AnkiCard[] {
  const rows = query(
    db,
    "SELECT id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses FROM cards"
  );
  return rows.map((row) => ({
    id: Number(row.id),
    nid: Number(row.nid),
    did: Number(row.did),
    ord: Number(row.ord),
    type: Number(row.type),
    queue: Number(row.queue),
    due: Number(row.due),
    ivl: Number(row.ivl),
    factor: Number(row.factor),
    reps: Number(row.reps),
    lapses: Number(row.lapses),
  }));
}

function parseRevlog(db: SqlJsDatabase): AnkiRevlogEntry[] {
  if (!tableExists(db, "revlog")) return [];

  const rows = query(
    db,
    "SELECT id, cid, ease, ivl, lastIvl, time, type FROM revlog ORDER BY id ASC"
  );
  return rows.map((row) => ({
    id: Number(row.id),
    cid: Number(row.cid),
    ease: Number(row.ease),
    ivl: Number(row.ivl),
    lastIvl: Number(row.lastIvl),
    time: Number(row.time),
    type: Number(row.type),
  }));
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export async function parseAnkiCollection(
  binary: Uint8Array
): Promise<AnkiCollection> {
  const db = await openAnkiDb(binary);

  try {
    const hasModernTables =
      tableExists(db, "notetypes") &&
      tableExists(db, "fields") &&
      tableExists(db, "templates");
    const hasColTable = tableExists(db, "col");

    let noteTypes: AnkiNoteType[];
    let decks: AnkiDeck[];

    if (hasModernTables) {
      noteTypes = parseNoteTypesModern(db);
      decks = parseDecksModern(db);

      // Fall back to col for anything missing
      if (noteTypes.length === 0 && hasColTable) {
        const colNoteTypes = parseNoteTypesFromCol(db);
        if (colNoteTypes.length > 0) noteTypes = colNoteTypes;
      }
      if (decks.length === 0 && hasColTable) {
        const colDecks = parseDecksFromCol(db);
        if (colDecks.length > 0) decks = colDecks;
      }
    } else if (hasColTable) {
      noteTypes = parseNoteTypesFromCol(db);
      decks = parseDecksFromCol(db);
    } else {
      throw new Error("Unrecognised Anki database format");
    }

    const notes = parseNotes(db);
    const cards = parseCards(db);
    const revlog = parseRevlog(db);

    // Filter out the Default deck if it has no cards
    const deckIdsWithCards = new Set(cards.map((c) => c.did));
    const filteredDecks = decks.filter(
      (d) => deckIdsWithCards.has(d.id) || d.name !== "Default"
    );

    return {
      noteTypes,
      decks: filteredDecks,
      notes,
      cards,
      revlog,
    };
  } finally {
    db.close();
  }
}

interface RawAnkiModel {
  id: number | string;
  name: string;
  flds: { name: string; ord: number }[];
  tmpls: { name: string; qfmt: string; afmt: string; ord: number }[];
  css: string;
}