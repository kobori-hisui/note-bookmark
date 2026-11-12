import {
  bookmarksItem,
  combineBookmarks,
  removeBookmark,
  replaceBookmarks,
  updateBookmark,
  type Bookmark,
} from '@/utils/bookmarks';
import { exportJson, isSafeUrl, mergeBookmarks, parseBackup } from '@/utils/backup';
import { folderLabel, groupBookmarks, type Folder } from '@/utils/folders';
import { buildDb, loadSqlJs } from '@/utils/sqlite';
import { textFragmentUrl } from '@/utils/quote';

const list = document.getElementById('list') as HTMLUListElement;
const empty = document.getElementById('empty') as HTMLParagraphElement;
const status = document.getElementById('status') as HTMLParagraphElement;
const fileInput = document.getElementById('file') as HTMLInputElement;
const selectBtn = document.getElementById('select') as HTMLButtonElement;
const bulk = document.getElementById('bulk') as HTMLDivElement;
const bulkCount = document.getElementById('bulk-count') as HTMLSpanElement;
const mergeBtn = document.getElementById('merge') as HTMLButtonElement;
const bulkCancel = document.getElementById('bulk-cancel') as HTMLButtonElement;

// Modo pestaña: el selector de archivos cierra el popup en algunos sistemas, por eso importar se hace aquí
const inTab = new URLSearchParams(location.search).has('tab');
if (inTab) document.body.classList.add('tab');

// Carpetas abiertas (se conserva al re-renderizar, p. ej. después de borrar)
const openFolders = new Set<string>();

// Estado de la pantalla
let all: Bookmark[] = [];
let editingId: string | null = null; // nota que se está editando
let selectMode = false; // modo "seleccionar para fusionar"
const selected = new Set<string>();

const rerender = () => render(all);

// ---- tarjeta de nota ----

async function openDataUrl(url: string) {
  const blob = await (await fetch(url)).blob();
  window.open(URL.createObjectURL(blob), '_blank');
}

function renderCard(b: Bookmark, showTitle = true): HTMLElement {
  if (b.id === editingId) return renderEditCard(b);

  const card = document.createElement('div');
  card.className = 'card';

  if (selectMode) {
    const label = document.createElement('label');
    label.className = 'pick';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = selected.has(b.id);
    card.classList.toggle('picked', box.checked);
    box.onchange = () => {
      if (box.checked) selected.add(b.id);
      else selected.delete(b.id);
      card.classList.toggle('picked', box.checked);
      updateBulk();
    };
    label.append(box, 'Seleccionar');
    card.append(label);
  }

  // título de la página (dentro de una subcarpeta ya está en el encabezado, ahí no se repite)
  if (showTitle && b.title) {
    const t = document.createElement('div');
    t.className = 'title';
    if (b.favicon) {
      const fav = document.createElement('img');
      fav.className = 'fav';
      fav.alt = '';
      fav.referrerPolicy = 'no-referrer';
      fav.src = b.favicon;
      fav.onerror = () => fav.remove(); // si el sitio no tiene ícono, simplemente no se muestra
      t.append(fav);
    }
    const txt = document.createElement('span');
    txt.textContent = b.title;
    txt.title = b.title;
    t.append(txt);
    card.append(t);
  }

  if (b.image) {
    const img = document.createElement('img');
    img.src = b.image;
    img.title = 'Abrir imagen completa';
    img.onclick = () => openDataUrl(b.image!);
    card.append(img);
  }

  if (b.images?.length) {
    const gallery = document.createElement('div');
    gallery.className = 'gallery';
    for (const src of b.images) {
      const im = document.createElement('img');
      im.src = src;
      im.loading = 'lazy';
      im.title = 'Abrir imagen completa';
      im.onclick = () => openDataUrl(src);
      gallery.append(im);
    }
    card.append(gallery);
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

  const edit = document.createElement('button');
  edit.className = 'edit-btn';
  edit.textContent = 'Editar';
  edit.onclick = () => {
    editingId = b.id;
    rerender();
  };

  const del = document.createElement('button');
  del.textContent = 'Borrar';
  del.onclick = async () => {
    const removed = await removeBookmark(b.id);
    if (removed) sayUndo('Nota borrada.', () => replaceBookmarks([removed.id], [removed]));
  };

  meta.append(a, date, edit, del);
  card.append(meta);
  return card;
}

/** Formulario para editar texto, título y URL (cambiar la URL = mover la nota a otra carpeta/subcarpeta). */
function renderEditCard(b: Bookmark): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card edit';

  const title = document.createElement('input');
  title.type = 'text';
  title.placeholder = 'Título de la página';
  title.value = b.title ?? '';

  const note = document.createElement('textarea');
  note.placeholder = 'Nota';
  note.value = b.note;

  const url = document.createElement('input');
  url.type = 'text';
  url.placeholder = 'URL';
  url.value = b.url;
  url.title = 'Si cambias la URL, la nota se mueve a la carpeta de esa página';

  const err = document.createElement('div');
  err.className = 'edit-err';
  err.hidden = true;

  const actions = document.createElement('div');
  actions.className = 'edit-actions';
  const cancel = document.createElement('button');
  cancel.textContent = 'Cancelar';
  const save = document.createElement('button');
  save.className = 'primary';
  save.textContent = 'Guardar';
  actions.append(cancel, save);

  const close = () => {
    editingId = null;
    rerender();
  };
  cancel.onclick = close;
  save.onclick = async () => {
    const u = url.value.trim();
    const n = note.value.trim();
    if (!isSafeUrl(u)) {
      err.textContent = 'La URL no es válida (usa http:// o https://).';
      err.hidden = false;
      return;
    }
    if (!n && !b.quote && !b.image && !b.images?.length) {
      err.textContent = 'La nota está vacía.';
      err.hidden = false;
      return;
    }
    await updateBookmark(b.id, { note: n, url: u, title: title.value.trim() || null });
    close();
  };
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save.click();
  });

  card.append(title, note, url, err, actions);
  setTimeout(() => note.focus(), 0);
  return card;
}

// ---- carpetas y subcarpetas ----

function renderDetails(
  openKey: string,
  label: string,
  tooltip: string,
  count: number,
  children: HTMLElement[],
  cls = '',
  extra?: HTMLElement,
): HTMLElement {
  const details = document.createElement('details');
  if (cls) details.className = cls;
  details.open = openFolders.has(openKey);
  details.addEventListener('toggle', () => {
    if (details.open) openFolders.add(openKey);
    else openFolders.delete(openKey);
  });

  const summary = document.createElement('summary');
  const name = document.createElement('span');
  name.className = 'fname';
  name.textContent = label;
  name.title = tooltip;
  const badge = document.createElement('span');
  badge.className = 'count';
  badge.textContent = String(count);
  summary.append(name);
  if (extra) summary.append(extra);
  summary.append(badge);

  const items = document.createElement('div');
  items.className = 'items';
  items.append(...children);

  details.append(summary, items);
  return details;
}

function renderFolder(f: Folder): HTMLElement {
  // subcarpetas (páginas con varias notas) primero, luego las notas sueltas de la carpeta
  const subs = f.subfolders.map((s) => {
    let pickAll: HTMLElement | undefined;
    if (selectMode) {
      const btn = document.createElement('button');
      btn.className = 'pickall';
      btn.textContent = 'Elegir todas';
      btn.onclick = (e) => {
        e.preventDefault(); // no abrir/cerrar la subcarpeta
        e.stopPropagation();
        s.items.forEach((b) => selected.add(b.id));
        updateBulk();
        rerender();
      };
      pickAll = btn;
    }
    return renderDetails(
      `${f.key}|${s.key}`,
      `📄 ${s.title ?? s.label}`,
      `${s.label}\n${s.key}`,
      s.items.length,
      s.items.map((b) => renderCard(b, false)),
      'sub',
      pickAll,
    );
  });
  return renderDetails(f.key, `📁 ${folderLabel(f.key)}`, folderLabel(f.key), f.items.length, [
    ...subs,
    ...f.rest.map((b) => renderCard(b)),
  ]);
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

// ---- mensajes de estado (con "Deshacer") ----

let statusTimer: number | undefined;

function say(text: string, kind: 'ok' | 'err') {
  clearTimeout(statusTimer);
  status.textContent = text;
  status.className = kind;
  status.hidden = false;
}

/** Mensaje con botón "Deshacer" que se oculta solo a los 10 s. */
function sayUndo(text: string, undo: () => Promise<void>) {
  clearTimeout(statusTimer);
  const btn = document.createElement('button');
  btn.className = 'undo';
  btn.textContent = 'Deshacer';
  btn.onclick = async () => {
    await undo();
    say('Restaurado ✓', 'ok');
  };
  status.replaceChildren(document.createTextNode(text + ' '), btn);
  status.className = 'ok';
  status.hidden = false;
  statusTimer = window.setTimeout(() => {
    status.hidden = true;
  }, 10_000);
}

// ---- seleccionar y fusionar ----

function updateBulk() {
  bulk.hidden = !selectMode;
  bulkCount.textContent = `${selected.size} seleccionada${selected.size === 1 ? '' : 's'}`;
  mergeBtn.disabled = selected.size < 2;
  selectBtn.classList.toggle('on', selectMode);
  selectBtn.textContent = selectMode ? '✕ Salir' : '☑ Seleccionar';
}

function setSelectMode(on: boolean) {
  selectMode = on;
  selected.clear();
  editingId = null;
  updateBulk();
  rerender();
}

selectBtn.addEventListener('click', () => setSelectMode(!selectMode));
bulkCancel.addEventListener('click', () => setSelectMode(false));

mergeBtn.addEventListener('click', async () => {
  const parts = all.filter((b) => selected.has(b.id));
  const merged = combineBookmarks(parts);
  if (typeof merged === 'string') return say(merged, 'err');
  await replaceBookmarks(
    parts.map((b) => b.id),
    [merged],
  );
  setSelectMode(false);
  sayUndo(`Fusionadas ${parts.length} notas en una.`, () => replaceBookmarks([merged.id], parts));
});

// ---- respaldo: exportar / importar ----

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

// ---- carga y actualización en vivo ----

function load(items: Bookmark[]) {
  all = items;
  // si una nota seleccionada o en edición ya no existe (borrada, fusionada), se quita del estado
  const ids = new Set(items.map((b) => b.id));
  for (const id of [...selected]) if (!ids.has(id)) selected.delete(id);
  if (editingId && !ids.has(editingId)) editingId = null;
  updateBulk();
  rerender();
}

bookmarksItem.getValue().then(load);
bookmarksItem.watch((v) => load(v ?? []));