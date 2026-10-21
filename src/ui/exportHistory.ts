import { type WritingHistory, serializeHistory } from '../storage/history';
import { isTauri } from '../storage/platform';

/** Saves a copy of the writing history wherever the writer chooses. */
export async function exportHistory(title: string, history: WritingHistory): Promise<void> {
  const csv = serializeHistory(history);
  const name = `${title} writing history.csv`;
  if (isTauri()) {
    const [{ save }, { writeTextFile }] = await Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/plugin-fs')]);
    const path = await save({ defaultPath: name, filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (path) await writeTextFile(path, csv);
    return;
  }
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
