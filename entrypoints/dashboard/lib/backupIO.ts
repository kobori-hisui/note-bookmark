import { exportJson, mergeBookmarks, parseBackup } from '@/utils/backup';
import { bookmarksItem, type Bookmark } from '@/utils/bookmarks';
import { groupBookmarks } from '@/utils/folders';
import { buildDb, loadSqlJs } from '@/utils/sqlite';

export const today = () => new Date().toISOString().slice(0, 10);

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export function exportJsonFile(items: Bookmark[], prefix = 'note-bookmarks') {
  download(new Blob([exportJson(items)], { type: 'application/json' }), `${prefix}-${today()}.json`);
}

export async function exportDbFile(items: Bookmark[]) {
  const SQL = await loadSqlJs();
  const folderById = new Map<string, string>();
  for (const f of groupBookmarks(items).folders) for (const b of f.items) folderById.set(b.id, f.label ?? f.key);
  const bytes = buildDb(SQL, items, folderById);
  download(new Blob([bytes as BlobPart], { type: 'application/vnd.sqlite3' }), `note-bookmarks-${today()}.db`);
}

export type ImportResult =
  | { ok: true; added: number; duplicates: number; skipped: number }
  | { ok: false; error: string };

/** Suma las notas del JSON a las existentes sin pisar nada (mismo id = se ignora). */
export async function importFromFile(file: File): Promise<ImportResult> {
  const parsed = parseBackup(await file.text());
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const current = await bookmarksItem.getValue();
  const { merged, added, duplicates } = mergeBookmarks(current, parsed.items);
  await bookmarksItem.setValue(merged);
  return { ok: true, added, duplicates, skipped: parsed.skipped };
}
