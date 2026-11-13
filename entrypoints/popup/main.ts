import {
  applyImagePatches,
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
import { settingsItem, updateSettings, type ImageMode } from '@/utils/settings';

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

/** Visor de imágenes dentro del popup: ← → para navegar, Esc / clic fuera / clic en la imagen para cerrar. */
function openLightbox(srcs: string[], start = 0) {
  let i = start;
  const n = srcs.length;
  const ov = document.createElement('div');
  ov.className = 'lightbox';

  const img = document.createElement('img');
  img.referrerPolicy = 'no-referrer';
  const counter = document.createElement('span');
  counter.className = 'lb-count';
  const mk = (cls: string, text: string, title: string) => {
    const b = document.createElement('button');
    b.className = `lb-btn ${cls}`;
    b.textContent = text;
    b.title = title;
    return b;
  };
  const prev = mk('lb-prev', '‹', 'Anterior (←)');
  const next = mk('lb-next', '›', 'Siguiente (→)');
  const closeBtn = mk('lb-close', '✕', 'Cerrar (Esc)');
  prev.hidden = next.hidden = n < 2;

  const show = () => {
    img.src = srcs[i];
    counter.textContent = n > 1 ? `${i + 1} / ${n}` : '';
  };
  const go = (d: number) => {
    i = (i + d + n) % n;
    show();
  };
  const close = () => {
    ov.remove();
    document.body.classList.remove('lb-open');
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowLeft' && n > 1) go(-1);
    else if (e.key === 'ArrowRight' && n > 1) go(1);
  };

  prev.onclick = () => go(-1);
  next.onclick = () => go(1);
  closeBtn.onclick = close;
  img.onclick = close;
  ov.onclick = (e) => {
    if (e.target === ov) close();
  };
  document.addEventListener('keydown', onKey, true);

  ov.append(img, prev, next, counter, closeBtn);
  document.body.classList.add('lb-open'); // da altura al popup aunque haya pocas notas
  document.body.append(ov);
  show();
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
    img.title = 'Ver imagen';
    img.onclick = () => openLightbox([b.image!]);
    card.append(img);
  }

  if (b.images?.length) {
    const gallery = document.createElement('div');
    gallery.className = 'gallery';
    const all = b.images;
    all.forEach((src, idx) => {
      const im = document.createElement('img');
      im.referrerPolicy = 'no-referrer';
      im.onerror = () => {
        const f = document.createElement('div');
        f.className = 'imgfail';
        f.textContent = '🖼 no disponible';
        f.title = 'No se pudo cargar: ¿sin conexión o el sitio la borró?';
        im.replaceWith(f);
      };
      im.src = src;
      im.loading = 'lazy';
      im.title = 'Ver imagen';
      im.onclick = () => openLightbox(all, idx);
      gallery.append(im);
    });
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
  a.href = b.quote ? textFragmentUrl(b.url, b.quote, b.fragment) : b.url;
  a.target = '_blank';
  a.textContent = b.url;
  const locatable = !!(b.quote || b.images?.length || b.anchor);
  a.title = locatable ? 'Abrir y ubicar la nota en la página' : b.url;
  if (locatable) {
    // clic normal: el background abre la pestaña y el content script se desplaza y marca el lugar exacto
    // (Ctrl/Shift/clic central siguen abriendo el enlace tal cual)
    a.addEventListener('click', (e) => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      browser.runtime.sendMessage({ type: 'open-note', id: b.id });
    });
  }

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

  // carpeta manual: escribe un nombre (o elige uno existente); vacío = carpeta automática por sitio
  const folder = document.createElement('input');
  folder.type = 'text';
  folder.placeholder = 'Carpeta (opcional; vacío = automática)';
  folder.value = b.folder ?? '';
  folder.setAttribute('list', 'folder-names');
  const names = document.createElement('datalist');
  names.id = 'folder-names';
  const seen = new Set<string>();
  for (const x of all) {
    const n = x.folder?.trim();
    if (n && !seen.has(n.toLowerCase())) {
      seen.add(n.toLowerCase());
      const o = document.createElement('option');
      o.value = n;
      names.append(o);
    }
  }

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
    await updateBookmark(b.id, { note: n, url: u, title: title.value.trim() || null, folder: folder.value.trim().slice(0, 60) || null });
    close();
  };
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save.click();
  });

  card.append(title, note, url, folder, names, err, actions);
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
  const name = f.label ?? folderLabel(f.key);
  return renderDetails(f.key, `${f.custom ? '🗂️' : '📁'} ${name}`, name, f.items.length, [
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
    for (const f of groupBookmarks(items).folders) for (const b of f.items) folderById.set(b.id, f.label ?? f.key);
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
  await browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') });
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

// ---- ajustes: imágenes como enlace u offline ----

const settingsBtn = document.getElementById('settings') as HTMLButtonElement;
const panel = document.getElementById('settings-panel') as HTMLElement;
const modeRadios = panel.querySelectorAll<HTMLInputElement>('input[name="imgmode"]');
const storageInfo = document.getElementById('storage-info') as HTMLParagraphElement;
const dlAll = document.getElementById('dl-all') as HTMLButtonElement;
const stripAll = document.getElementById('strip-all') as HTMLButtonElement;

const isHttp = (s: string) => /^https?:\/\//i.test(s);
const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

/** Cuánto ocupan las notas: ayuda a decidir entre "solo enlace" y "offline". */
function refreshStorageInfo() {
  let downloaded = 0;
  let links = 0;
  let bytes = 0;
  for (const b of all) {
    for (const s of b.images ?? []) {
      if (isHttp(s)) links++;
      else {
        downloaded++;
        bytes += s.length * 0.75; // base64 -> bytes aprox.
      }
    }
    if (b.image) bytes += b.image.length * 0.75; // capturas de región (siempre quedan guardadas)
  }
  storageInfo.textContent = `${all.length} notas · ${downloaded} imágenes descargadas · ${links} solo enlace · ocupan ~${mb(bytes)}`;
}

function openSettings() {
  panel.hidden = false;
  refreshStorageInfo();
}

settingsBtn.addEventListener('click', () => {
  panel.hidden = !panel.hidden;
  if (!panel.hidden) refreshStorageInfo();
});
settingsItem.getValue().then((s) => modeRadios.forEach((r) => (r.checked = r.value === s.imageMode)));
modeRadios.forEach((r) =>
  r.addEventListener('change', async () => {
    if (r.checked) await updateSettings({ imageMode: r.value as ImageMode });
  }),
);
if (new URLSearchParams(location.search).has('settings')) openSettings();

/** La descarga masiva necesita que la ventana siga abierta: el popup se cierra al perder el foco, así que va en pestaña. */
async function ensureTab(): Promise<boolean> {
  if (inTab) return true;
  await browser.tabs.create({ url: browser.runtime.getURL('/popup.html?tab=1&settings=1') });
  window.close();
  return false;
}

dlAll.addEventListener('click', async () => {
  if (!(await ensureTab())) return;
  dlAll.disabled = stripAll.disabled = true;
  try {
    const targets = all.filter((b) => b.images?.some(isHttp));
    const total = targets.reduce((n, b) => n + b.images!.filter(isHttp).length, 0);
    if (!total) return say('No hay imágenes pendientes de descargar.', 'ok');

    let done = 0;
    let failed = 0;
    let patches: Record<string, string[]> = {};
    let batch = 0;
    for (const b of targets) {
      const out = [...b.images!];
      for (let i = 0; i < out.length; i += 4) {
        // 4 en paralelo
        await Promise.all(
          out.slice(i, i + 4).map(async (s, k) => {
            if (!isHttp(s)) return;
            const res = await browser.runtime.sendMessage({ type: 'fetch-image', url: s }).catch(() => null);
            if (typeof res?.dataUrl === 'string') out[i + k] = res.dataUrl;
            else failed++;
            done++;
            say(`Descargando ${done}/${total}…`, 'ok');
          }),
        );
      }
      patches[b.id] = out;
      if (++batch % 10 === 0) {
        await applyImagePatches(patches); // se guarda por tandas para no perder avance
        patches = {};
      }
    }
    if (Object.keys(patches).length) await applyImagePatches(patches);
    say(
      `Listo: ${total - failed} descargadas` + (failed ? ` · ${failed} fallaron (siguen como enlace)` : '') + '.',
      failed ? 'err' : 'ok',
    );
  } finally {
    dlAll.disabled = stripAll.disabled = false;
  }
});

stripAll.addEventListener('click', async () => {
  const patches: Record<string, string[]> = {};
  let n = 0;
  for (const b of all) {
    if (!b.images?.length) continue;
    const out = b.images.map((s, i) => {
      const src = b.imageSrcs?.[i];
      if (!isHttp(s) && src && isHttp(src)) {
        n++;
        return src;
      }
      return s; // sin enlace original: se conserva la copia, no hay forma de recuperarla
    });
    if (out.some((s, i) => s !== b.images![i])) patches[b.id] = out;
  }
  if (!n) return say('No hay copias descargadas que se puedan liberar.', 'ok');
  if (!confirm(`Se borrarán ${n} copias descargadas y quedarán solo sus enlaces. ¿Continuar?`)) return;
  await applyImagePatches(patches);
  say(`Liberadas ${n} imágenes; ahora solo quedan los enlaces.`, 'ok');
});

// ---- carga y actualización en vivo ----

function load(items: Bookmark[]) {
  all = items;
  // si una nota seleccionada o en edición ya no existe (borrada, fusionada), se quita del estado
  const ids = new Set(items.map((b) => b.id));
  for (const id of [...selected]) if (!ids.has(id)) selected.delete(id);
  if (editingId && !ids.has(editingId)) editingId = null;
  updateBulk();
  refreshStorageInfo();
  rerender();
}

bookmarksItem.getValue().then(load);
bookmarksItem.watch((v) => load(v ?? []));