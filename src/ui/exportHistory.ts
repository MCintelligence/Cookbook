import { type WritingHistory, serializeHistory } from '../storage/history';
import { KINDS, saveFile } from './saveFile';

/** Saves a copy of the writing history wherever the writer chooses. */
export async function exportHistory(title: string, history: WritingHistory): Promise<void> {
  await saveFile(`${title} writing history`, serializeHistory(history), KINDS.csv);
}
