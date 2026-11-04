import { bookmarksItem, removeBookmark, type Bookmark } from '@/utils/bookmarks';
import { exportJson, mergeBookmarks, parseBackup } from '@/utils/backup';
import { folderLabel, groupBookmarks, type Folder } from '@/utils/folders';
import { buildDb, loadSqlJs } from '@/utils/sqlite';
import { textFragmentUrl } from '@/utils/quote';

const list = document.getElementById('list') as HTMLUListElement;
const empty = document.getElementById('empty') as HTMLParagraphElement;
const status = document.getElementById('status') as HTMLParagraphElement;
const fileInput = document.getElementById('file') as HTMLInputElement;

// Modo pestaña: el selector de archivos cierra el popup en algunos sistemas, por eso importar se hace aquí
const inTab = new URLSearchParams(location.search).has('tab');
if (inTab) document.body.classList.add('tab');

// Carpetas abiertas (se conserva al re-renderizar, p. ej. después de borrar)
const openFolders = new Set<string>();

function renderCard(b: Bookmark): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card';

  if (b.image) {
    const img = document.createElement('img');
    img.src = b.image;
    img.title = 'Abrir imagen completa';
    img.onclick = async () => {
      const blob = await (await fetch(b.image!)).blob();
      window.open(URL.createObjectURL(blob), '_blank');
    };
    card.append(img);
  }

  if (b.quote) {
    const q = document.createElement('div');
    q.className = 'quote';
    q.textContent = b.quote;
    card.append(q);
  }

  if (b.note) {
    const note = document.createElement('div');
    note.className = 'note';
    note.textContent = b.note;
    card.append(note);
  }

  const meta = document.createElement('div');
  meta.className = 'meta';

  // La carpeta solo muestra la ruta parcial; aquí siempre va la URL completa.
  // Con cita, el enlace abre la página y resalta el texto citado.
  const a = document.createElement('a');
  a.href = b.quote ? textFragmentUrl(b.url, b.quote) : b.url;
  a.target = '_blank';
  a.textContent = b.url;
  a.title = b.quote ? 'Abrir y resaltar el texto citado' : b.url;

  const date = document.createElement('span');
  const d = new Date(b.date);
  date.textContent = isNaN(d.getTime()) ? '' : d.toLocaleString('es-PE');

  const del = document.createElement('button');
  del.textContent = 'Borrar';
  del.onclick = () => removeBookmark(b.id);

  meta.append(a, date, del);
  card.append(meta);
  return card;
}

function renderFolder(f: Folder): HTMLElement {
  const details = document.createElement('details');
  details.open = openFolders.has(f.key);
  details.addEventListener('toggle', () => {
    if (details.open) openFolders.add(f.key);
    else openFolders.delete(f.key);
  });

  const summary = document.createElement('summary');
  const name = document.createElement('span');
  name.className = 'fname';
  name.textContent = `📁 ${folderLabel(f.key)}`;
  name.title = folderLabel(f.key);
  const count = document.createElement('span');
  count.className = 'count';
  count.textContent = String(f.items.length);
  summary.append(name, count);

  const items = document.createElement('div');
  items.className = 'items';
  items.append(...f.items.map(renderCard));

  details.append(summary, items);
  return details;
}

function render(items: Bookmark[]) {
  list.replaceChildren();
  empty.hidden = items.length > 0;

  const { folders, loose } = groupBookmarks(items);

  for (const f of folders) {
    const li = document.createElement('li');
    li.append(renderFolder(f));
    list.append(li);
  }

  if (folders.length && loose.length) {
    const h = document.createElement('li');
    h.className = 'section';
    h.textContent = 'Sin carpeta';
    list.append(h);
  }
  for (const b of loose) {
    const li = document.createElement('li');
    li.append(renderCard(b));
    list.append(li);
  }
}

// ---- respaldo: exportar / importar ----

function say(text: string, kind: 'ok' | 'err') {
  status.textContent = text;
  status.className = kind;
  status.hidden = false;
}

const today = () => new Date().toISOString().slice(0, 10);

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

document.getElementById('export')!.addEventListener('click', async () => {
  const items = await bookmarksItem.getValue();
  if (!items.length) return say('No hay notas para exportar.', 'err');
  download(new Blob([exportJson(items)], { type: 'application/json' }), `note-bookmarks-${today()}.json`);
  say(`Exportadas ${items.length} notas (JSON).`, 'ok');
});

document.getElementById('export-db')!.addEventListener('click', async () => {
  const items = await bookmarksItem.getValue();
  if (!items.length) return say('No hay notas para exportar.', 'err');
  say('Generando .db…', 'ok');
  try {
    const SQL = await loadSqlJs();
    // misma carpeta que ves en el popup, para poder filtrar por ella en el gestor
    const folderById = new Map<string, string>();
    for (const f of groupBookmarks(items).folders) for (const b of f.items) folderById.set(b.id, f.key);
    const bytes = buildDb(SQL, items, folderById);
    download(new Blob([bytes as BlobPart], { type: 'application/vnd.sqlite3' }), `note-bookmarks-${today()}.db`);
    say(`Exportadas ${items.length} notas a SQLite (.db).`, 'ok');
  } catch (e) {
    say(`No se pudo generar el .db: ${e instanceof Error ? e.message : String(e)}`, 'err');
  }
});

document.getElementById('import')!.addEventListener('click', async () => {
  if (inTab) {
    fileInput.click();
    return;
  }
  // desde el popup: abrir la pestaña completa, donde el selector de archivos no cierra la ventana
  await browser.tabs.create({ url: browser.runtime.getURL('/popup.html?tab=1') });
  window.close();
});

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file) return;
  const parsed = parseBackup(await file.text());
  if (!parsed.ok) return say(parsed.error, 'err');

  const current = await bookmarksItem.getValue();
  const { merged, added, duplicates } = mergeBookmarks(current, parsed.items);
  await bookmarksItem.setValue(merged);
  say(
    `Importadas ${added} · ya existían ${duplicates}` + (parsed.skipped ? ` · descartadas ${parsed.skipped} inválidas` : ''),
    'ok',
  );
});

bookmarksItem.getValue().then(render);
bookmarksItem.watch((v) => render(v ?? []));
