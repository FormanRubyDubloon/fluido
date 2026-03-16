import JSZip from "jszip";
import { decompress } from "fzstd";

export interface ApkgContents {
  collectionBinary: Uint8Array;
  mediaMap: Record<string, string>;
  mediaFiles: Map<string, Uint8Array>;
}

/**
 * Try to decompress zstd data. Returns original data if not zstd-compressed.
 * Zstd magic number: 0x28B52FFD
 */
function tryZstdDecompress(data: Uint8Array): Uint8Array {
  if (
    data.length >= 4 &&
    data[0] === 0x28 &&
    data[1] === 0xb5 &&
    data[2] === 0x2f &&
    data[3] === 0xfd
  ) {
    return decompress(data);
  }
  return data;
}

/**
 * Parse a protobuf media map (used in modern Anki exports).
 * Each top-level field 1 is a sub-message with:
 *   field 1 = filename (string)
 *   field 2 = size (varint)
 */
function parseProtobufMediaMap(data: Uint8Array): Record<string, string> {
  const map: Record<string, string> = {};
  let idx = 0;
  let entryIndex = 0;

  while (idx < data.length) {
    const tag = data[idx]!;
    const fieldNum = tag >> 3;
    const wireType = tag & 0x07;
    idx++;

    if (wireType === 2) {
      // Length-delimited
      let length = 0;
      let shift = 0;
      while (idx < data.length) {
        const b = data[idx]!;
        idx++;
        length |= (b & 0x7f) << shift;
        shift += 7;
        if (!(b & 0x80)) break;
      }
      const value = data.slice(idx, idx + length);
      idx += length;

      if (fieldNum === 1) {
        // Parse sub-message to get filename
        const name = parseMediaEntryName(value);
        if (name) {
          map[String(entryIndex)] = name;
          entryIndex++;
        }
      }
    } else if (wireType === 0) {
      // Varint — skip
      while (idx < data.length && data[idx]! & 0x80) idx++;
      idx++;
    } else {
      break;
    }
  }

  return map;
}

function parseMediaEntryName(data: Uint8Array): string | null {
  let idx = 0;
  while (idx < data.length) {
    const tag = data[idx]!;
    const fieldNum = tag >> 3;
    const wireType = tag & 0x07;
    idx++;

    if (wireType === 2) {
      let length = 0;
      let shift = 0;
      while (idx < data.length) {
        const b = data[idx]!;
        idx++;
        length |= (b & 0x7f) << shift;
        shift += 7;
        if (!(b & 0x80)) break;
      }
      const value = data.slice(idx, idx + length);
      idx += length;

      if (fieldNum === 1) {
        return new TextDecoder().decode(value);
      }
    } else if (wireType === 0) {
      while (idx < data.length && data[idx]! & 0x80) idx++;
      idx++;
    } else {
      break;
    }
  }
  return null;
}

export async function unzipApkg(buffer: ArrayBuffer): Promise<ApkgContents> {
  const zip = await JSZip.loadAsync(buffer);

  // Find the collection database (prefer anki21b, then anki21, then anki2)
  const anki21bFile = zip.file("collection.anki21b");
  const anki21File = zip.file("collection.anki21");
  const anki2File = zip.file("collection.anki2");

  let collectionBinary: Uint8Array;

  if (anki21bFile) {
    // Modern format: zstd-compressed
    const compressed = await anki21bFile.async("uint8array");
    collectionBinary = tryZstdDecompress(compressed);
  } else if (anki21File) {
    collectionBinary = await anki21File.async("uint8array");
  } else if (anki2File) {
    collectionBinary = await anki2File.async("uint8array");
  } else {
    throw new Error("Invalid .apkg file: no collection database found");
  }

  // Parse the media map (could be JSON or zstd-compressed protobuf)
  let mediaMap: Record<string, string> = {};
  const mediaFile = zip.file("media");
  if (mediaFile) {
    const mediaRaw = await mediaFile.async("uint8array");
    const mediaData = tryZstdDecompress(mediaRaw);

    // Try JSON first
    try {
      const mediaJson = new TextDecoder().decode(mediaData);
      mediaMap = JSON.parse(mediaJson);
    } catch {
      // Try protobuf format
      try {
        mediaMap = parseProtobufMediaMap(mediaData);
      } catch {
        console.warn("Could not parse media map — skipping media import");
      }
    }
  }

  // Extract all numbered media files
  const mediaFiles = new Map<string, Uint8Array>();
  for (const [numericName, originalName] of Object.entries(mediaMap)) {
    const file = zip.file(numericName);
    if (file) {
      const data = await file.async("uint8array");
      mediaFiles.set(originalName, data);
    } else {
      console.warn(
        `Media file ${numericName} (${originalName}) not found in archive`
      );
    }
  }

  return { collectionBinary, mediaMap, mediaFiles };
}