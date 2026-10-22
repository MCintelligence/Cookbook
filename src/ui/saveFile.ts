import { isTauri } from '../storage/platform';

export interface FileKind {
  /** Shown in the save dialog, such as "Word document". */
  label: string;
  extension: string;
  mime: string;
}

export const KINDS = {
  csv: { label: 'CSV', extension: 'csv', mime: 'text/csv' },
  docx: { label: 'Word document', extension: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  epub: { label: 'EPUB e-book', extension: 'epub', mime: 'application/epub+zip' },
  md: { label: 'Markdown', extension: 'md', mime: 'text/markdown' },
  zip: { label: 'Zip archive', extension: 'zip', mime: 'application/zip' },
} satisfies Record<string, FileKind>;

/**
 * Saves a file wherever the writer chooses: a save dialog in the desktop app,
 * a download in the browser. Resolves to false when the writer cancels.
 */
export async function saveFile(name: string, data: string | Uint8Array, kind: FileKind): Promise<boolean> {
  const fileName = name.endsWith('.' + kind.extension) ? name : `${name}.${kind.extension}`;
  if (isTauri()) {
    const [{ save }, { writeFile, writeTextFile }] = await Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/plugin-fs')]);
    const path = await save({ defaultPath: fileName, filters: [{ name: kind.label, extensions: [kind.extension] }] });
    if (!path) return false;
    if (typeof data === 'string') await writeTextFile(path, data);
    else await writeFile(path, data);
    return true;
  }
  const blob = new Blob([typeof data === 'string' ? data : new Uint8Array(data)], { type: kind.mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
