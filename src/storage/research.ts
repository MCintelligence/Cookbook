import { strFromU8 } from 'fflate';
import { type StorageAdapter, joinPath } from './adapter';
import { FILES, fileNameFor, writeDocument } from './book';
import { newId } from './document';
import { freeName } from './order';

/**
 * Research, as in Scrivener: besides pages of words, it holds files to look at while writing.
 * Each one is an ordinary Item in research/ (so it has a title, a synopsis, a label and a page of
 * notes, and can be moved and grouped like any other) whose `file` field names the file itself,
 * kept in files/. Moving or renaming the Item never touches the file.
 */

/** How Research shows a file. */
export type ResearchKind = 'picture' | 'pdf' | 'web' | 'sound' | 'film' | 'other';

const PICTURE = /^(png|jpe?g|gif|webp|bmp|svg|avif|ico|tiff?|heic|heif)$/;
const WEB = /^(html?|xhtml|webarchive|mht(ml)?)$/;
const SOUND = /^(mp3|m4a|wav|aiff?|aac|ogg|oga|opus|flac|caf)$/;
const FILM = /^(mp4|mov|m4v|webm|ogv)$/;

export const extensionOf = (name: string): string => (name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '');

export function researchKind(name: string): ResearchKind {
  const ext = extensionOf(name);
  if (ext === 'pdf') return 'pdf';
  if (PICTURE.test(ext)) return 'picture';
  if (WEB.test(ext)) return 'web';
  if (SOUND.test(ext)) return 'sound';
  if (FILM.test(ext)) return 'film';
  return 'other';
}

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  ico: 'image/x-icon',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
  htm: 'text/html',
  html: 'text/html',
  xhtml: 'application/xhtml+xml',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  caf: 'audio/x-caf',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  ogv: 'video/ogg',
};

export function mimeOf(name: string): string {
  return MIME[extensionOf(name)] ?? 'application/octet-stream';
}

/** What a file is, in a word or two, for the Research viewer's heading and the Shelf's tooltips. */
export function kindName(name: string): string {
  const ext = extensionOf(name);
  switch (researchKind(name)) {
    case 'pdf':
      return 'PDF';
    case 'picture':
      return 'Picture';
    case 'web':
      return 'Web page';
    case 'sound':
      return 'Sound';
    case 'film':
      return 'Film';
    default:
      return ext ? `${ext.toUpperCase()} file` : 'File';
  }
}

/** A file's name without its extension, as a title. */
export function titleOfFile(fileName: string): string {
  const ext = extensionOf(fileName);
  return (ext ? fileName.slice(0, -(ext.length + 1)) : fileName).trim() || 'Untitled';
}

/** Keeps a file's bytes in files/, named after `title`, and returns where it was kept. */
export async function keepResearchFile(fs: StorageAdapter, fileName: string, title: string, bytes: Uint8Array): Promise<string> {
  const ext = extensionOf(fileName);
  await fs.makeFolder(FILES);
  const dot = ext ? `.${ext}` : '';
  const kept = joinPath(FILES, await freeName(fs, FILES, `${fileNameFor(title)}${dot}`, dot || undefined));
  await fs.writeBytes(kept, bytes);
  return kept;
}

/**
 * A web address as typed or pasted: "example.com/page" gains https://. Null if it can't be one.
 */
export function webAddress(typed: string): string | null {
  const t = typed.trim();
  if (!t || /\s/.test(t)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return u.href;
  } catch {
    return null;
  }
}

/** A short title for a web address: its site and last part, such as "example.com · history". */
export function titleOfAddress(href: string): string {
  const u = new URL(href);
  const host = u.hostname.replace(/^www\./, '');
  const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();
  return last ? `${host} · ${last}` : host;
}

/**
 * Keeps a file in files/ and makes the Research Item that shows it, in `folder`. The Item is
 * titled after the file unless a title is given; `fields` and `body` (its notes) are added to it.
 * Returns the new Item's path.
 */
export async function addResearchFile(
  fs: StorageAdapter,
  folder: string,
  fileName: string,
  bytes: Uint8Array,
  extra: { title?: string; fields?: Record<string, unknown>; body?: string; itemName?: string } = {},
): Promise<string> {
  const title = extra.title ?? titleOfFile(fileName);
  const kept = await keepResearchFile(fs, fileName, title, bytes);
  await fs.makeFolder(folder);
  const name = extra.itemName ?? (await freeName(fs, folder, `${fileNameFor(title)}.md`, '.md'));
  const path = joinPath(folder, name);
  await writeDocument(fs, path, { id: newId(), title, kind: 'scene', fields: { ...extra.fields, file: kept }, body: extra.body ?? '' });
  return path;
}

// ---------- Safari web archives ----------

/** A property list value, as read by readPlist. Data comes back as bytes. */
export type PlistValue = string | number | boolean | null | Date | Uint8Array | PlistValue[] | { [key: string]: PlistValue };

/** Reads a binary property list (bplist00), the format of a Safari .webarchive. Throws if it isn't one. */
export function readBinaryPlist(bytes: Uint8Array): PlistValue {
  if (bytes.length < 40 || strFromU8(bytes.subarray(0, 8)) !== 'bplist00') throw new Error('Not a binary property list.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const trailer = bytes.length - 32;
  const offsetSize = bytes[trailer + 6]!;
  const refSize = bytes[trailer + 7]!;
  const count = Number(view.getBigUint64(trailer + 8));
  const top = Number(view.getBigUint64(trailer + 16));
  const table = Number(view.getBigUint64(trailer + 24));
  const uint = (at: number, size: number): number => {
    let n = 0;
    for (let i = 0; i < size; i++) n = n * 256 + bytes[at + i]!;
    return n;
  };
  const offsets = Array.from({ length: count }, (_, i) => uint(table + i * offsetSize, offsetSize));
  const seen = new Set<number>();
  const read = (ref: number): PlistValue => {
    if (ref >= count) throw new Error('Damaged property list.');
    // A list that refers back to itself would never end.
    if (seen.has(ref)) throw new Error('Damaged property list.');
    seen.add(ref);
    try {
      return readAt(offsets[ref]!);
    } finally {
      seen.delete(ref);
    }
  };
  /** The length of an object, from its marker or the integer after it, and where its contents start. */
  const sized = (at: number): [number, number] => {
    const low = bytes[at]! & 0x0f;
    if (low !== 0x0f) return [low, at + 1];
    const size = 1 << (bytes[at + 1]! & 0x0f);
    return [uint(at + 2, size), at + 2 + size];
  };
  const readAt = (at: number): PlistValue => {
    const marker = bytes[at]!;
    const high = marker >> 4;
    switch (high) {
      case 0x0:
        return marker === 0x09 ? true : marker === 0x08 ? false : null;
      case 0x1: {
        const size = 1 << (marker & 0x0f);
        return size === 8 ? Number(view.getBigInt64(at + 1)) : uint(at + 1, size);
      }
      case 0x2:
        return (marker & 0x0f) === 3 ? view.getFloat64(at + 1) : view.getFloat32(at + 1);
      case 0x3:
        return new Date(Date.UTC(2001, 0, 1) + view.getFloat64(at + 1) * 1000);
      case 0x4: {
        const [n, from] = sized(at);
        return bytes.slice(from, from + n);
      }
      case 0x5: {
        const [n, from] = sized(at);
        return strFromU8(bytes.subarray(from, from + n), true);
      }
      case 0x6: {
        const [n, from] = sized(at);
        let s = '';
        for (let i = 0; i < n; i++) s += String.fromCharCode(view.getUint16(from + i * 2));
        return s;
      }
      case 0x8:
        return uint(at + 1, (marker & 0x0f) + 1);
      case 0xa: {
        const [n, from] = sized(at);
        return Array.from({ length: n }, (_, i) => read(uint(from + i * refSize, refSize)));
      }
      case 0xd: {
        const [n, from] = sized(at);
        const out: { [key: string]: PlistValue } = {};
        for (let i = 0; i < n; i++) {
          const key = read(uint(from + i * refSize, refSize));
          out[String(key)] = read(uint(from + (n + i) * refSize, refSize));
        }
        return out;
      }
      default:
        throw new Error('Damaged property list.');
    }
  };
  return read(top);
}

/** One file of a saved web page: the page itself or a picture, stylesheet or font it uses. */
export interface WebResource {
  url: string;
  mime: string;
  /** The text encoding the page was saved in, such as UTF-8, if it says. */
  encoding: string | null;
  data: Uint8Array;
}

export interface WebArchive {
  main: WebResource;
  resources: WebResource[];
}

const resourceOf = (v: PlistValue | undefined): WebResource | null => {
  if (!v || typeof v !== 'object' || Array.isArray(v) || v instanceof Uint8Array || v instanceof Date) return null;
  const data = v.WebResourceData;
  if (!(data instanceof Uint8Array)) return null;
  return {
    url: typeof v.WebResourceURL === 'string' ? v.WebResourceURL : '',
    mime: typeof v.WebResourceMIMEType === 'string' ? v.WebResourceMIMEType : 'application/octet-stream',
    encoding: typeof v.WebResourceTextEncodingName === 'string' ? v.WebResourceTextEncodingName : null,
    data,
  };
};

/** Reads a Safari .webarchive: the page and the pictures, stylesheets and fonts saved with it. Null if it can't be read. */
export function readWebArchive(bytes: Uint8Array): WebArchive | null {
  try {
    const root = readBinaryPlist(bytes);
    if (!root || typeof root !== 'object' || Array.isArray(root) || root instanceof Uint8Array || root instanceof Date) return null;
    const main = resourceOf(root.WebMainResource);
    if (!main) return null;
    const subs = Array.isArray(root.WebSubresources) ? root.WebSubresources : [];
    return { main, resources: subs.map(resourceOf).filter((r): r is WebResource => r !== null) };
  } catch {
    return null;
  }
}

/** Decodes a page's text in the encoding it was saved in, or UTF-8. */
export function decodeText(data: Uint8Array, encoding: string | null): string {
  try {
    return new TextDecoder(encoding ?? 'utf-8').decode(data);
  } catch {
    return new TextDecoder().decode(data);
  }
}
