import { bookmarksItem, type Bookmark } from '@/utils/bookmarks';
import { cleanFolderPath } from '@/utils/folders';
import { settingsItem } from '@/utils/settings';

/**
 * Comando "/carpeta" en CUALQUIER campo de texto de cualquier sitio (como los slash commands de Notion o Slack).
 *
 * Escribes `/blonde-beatiful/biography` en un textarea, un input o un editor (contenteditable) y aparece una lista con las
 * notas de esa carpeta: Enter inserta su texto en el lugar del comando, y sus imágenes se copian al portapapeles
 * (Ctrl+V donde quieras). Con una ruta incompleta (`/blonde`) sugiere carpetas; Tab/Enter completan.
 *
 * Para no estorbar a las páginas que ya usan "/" (Slack, Notion, GitHub…) el menú SOLO aparece si lo escrito coincide con
 * una carpeta que existe, el "/" va al inicio o tras un espacio, y hay al menos 2 caracteres. Se puede apagar en Ajustes.
 */

const MAX_ROWS = 8;
const MIN_QUERY = 2;
const CACHE_MS = 60_000; // las notas (con sus imágenes) no se quedan en memoria de cada pestaña

// ---- datos ----

interface FolderEntry {
  path: string; // ruta con mayúsculas de la nota más reciente
  count: number; // notas en ella y en sus hijas
  parent: string | null; // clave (en minúsculas) del padre
}
interface Index {
  notes: Bookmark[];
  folders: Map<string, FolderEntry>; // clave en minúsculas -> carpeta
}

let cache: Index | null = null;
let cacheTimer: number | undefined;
let watching = false;

const pathKey = (b: Bookmark) => cleanFolderPath(b.folder)?.toLowerCase() ?? null;

async function loadIndex(): Promise<Index> {
  if (cache) return cache;
  const notes = (await bookmarksItem.getValue()).slice().sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  const folders = new Map<string, FolderEntry>();
  for (const b of notes) {
    const full = cleanFolderPath(b.folder);
    if (!full) continue;
    const segs = full.split('/');
    for (let i = 1; i <= segs.length; i++) {
      const path = segs.slice(0, i).join('/');
      const key = path.toLowerCase();
      const e = folders.get(key);
      if (e) e.count++;
      else folders.set(key, { path, count: 1, parent: i > 1 ? segs.slice(0, i - 1).join('/').toLowerCase() : null });
    }
  }
  cache = { notes, folders };
  window.clearTimeout(cacheTimer);
  cacheTimer = window.setTimeout(() => (cache = null), CACHE_MS);
  if (!watching) {
    watching = true;
    bookmarksItem.watch(() => (cache = null)); // cualquier cambio en las notas invalida la copia
  }
  return cache;
}

let enabledCache: boolean | null = null;
let watchingSettings = false;
async function isEnabled(): Promise<boolean> {
  if (enabledCache !== null) return enabledCache;
  enabledCache = (await settingsItem.getValue()).inlineInsert !== false;
  if (!watchingSettings) {
    watchingSettings = true;
    settingsItem.watch((s) => (enabledCache = s?.inlineInsert !== false));
  }
  return enabledCache;
}

// ---- filas del menú ----

type Row =
  | { kind: 'folder'; path: string; count: number }
  | { kind: 'note'; note: Bookmark; images: string[] };

const imagesOf = (b: Bookmark) => [b.image, ...(b.images ?? [])].filter((s): s is string => !!s);

function buildRows(idx: Index, query: string): Row[] {
  const q = cleanFolderPath(query)?.toLowerCase();
  if (!q || q.length < MIN_QUERY) return [];

  const exact = idx.folders.get(q);
  if (exact) {
    const rows: Row[] = [];
    // carpetas hijas (para bajar un nivel) y luego las notas guardadas directamente en esta
    for (const f of idx.folders.values()) if (f.parent === q) rows.push({ kind: 'folder', path: f.path, count: f.count });
    for (const b of idx.notes) if (pathKey(b) === q) rows.push({ kind: 'note', note: b, images: imagesOf(b) });
    return rows.slice(0, MAX_ROWS * 4);
  }

  // ruta incompleta: sugiere carpetas que empiecen igual, o cuyo último nivel empiece igual ("/biog" -> a/b/biography)
  const rows: Row[] = [];
  for (const [k, f] of idx.folders) {
    const leaf = k.slice(k.lastIndexOf('/') + 1);
    if (k.startsWith(q) || (!q.includes('/') && leaf.startsWith(q))) rows.push({ kind: 'folder', path: f.path, count: f.count });
  }
  rows.sort((a, b) => Number(b.kind === 'folder' && b.path.toLowerCase().startsWith(q)) - Number(a.kind === 'folder' && a.path.toLowerCase().startsWith(q)));
  return rows.slice(0, MAX_ROWS);
}

// ---- detectar el comando junto al cursor ----

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

const TEXT_INPUTS = new Set(['text', 'search', 'url', '']);
const TOKEN = /(?:^|\s)(\/(?:"[^"\n]*"?|[^\s"]+))$/; // "/ruta" o "/"ruta con espacios"

function editableOf(t: EventTarget | undefined): Field | null {
  if (t instanceof HTMLTextAreaElement) return t.readOnly || t.disabled ? null : t;
  if (t instanceof HTMLInputElement) return TEXT_INPUTS.has(t.type) && !t.readOnly && !t.disabled ? t : null;
  if (t instanceof HTMLElement && t.isContentEditable) return t;
  return null;
}

/** Texto que hay justo antes del cursor (en el mismo nodo de texto, para los editores contenteditable). */
function textBeforeCaret(el: Field): string | null {
  try {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      if (el.selectionStart === null || el.selectionStart !== el.selectionEnd) return null;
      return el.value.slice(0, el.selectionStart);
    }
    const sel = window.getSelection();
    if (!sel || !sel.isCollapsed || !sel.anchorNode || sel.anchorNode.nodeType !== Node.TEXT_NODE) return null;
    if (!el.contains(sel.anchorNode)) return null;
    return (sel.anchorNode as Text).data.slice(0, sel.anchorOffset);
  } catch {
    return null; // input type=email y similares lanzan al leer selectionStart
  }
}

const queryOf = (token: string) => token.slice(1).replace(/^"/, '').replace(/"$/, '');

// ---- escribir en el campo ----

/** Reemplaza los últimos `tokenLen` caracteres antes del cursor por `text` (o inserta en el cursor si no coinciden). */
function replaceToken(el: Field, token: string, text: string) {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.focus();
    const end = el.selectionEnd ?? el.value.length;
    const before = el.value.slice(0, end);
    const start = before.endsWith(token) ? end - token.length : end;
    const next = el.value.slice(0, start) + text + el.value.slice(end);
    // por el setter nativo: así React y otros frameworks se enteran del cambio
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, next);
    const caret = start + text.length;
    el.setSelectionRange(caret, caret);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    return;
  }
  el.focus();
  const sel = window.getSelection();
  if (sel?.anchorNode?.nodeType === Node.TEXT_NODE && sel.isCollapsed) {
    const node = sel.anchorNode as Text;
    const off = sel.anchorOffset;
    if (node.data.slice(0, off).endsWith(token)) {
      const r = document.createRange();
      r.setStart(node, off - token.length);
      r.setEnd(node, off);
      sel.removeAllRanges();
      sel.addRange(r); // selecciona el comando para que lo pise lo que se inserta
    }
  }
  if (text === '') document.execCommand('delete');
  else if (!document.execCommand('insertText', false, text)) {
    const r = sel?.rangeCount ? sel.getRangeAt(0) : null;
    if (r) {
      r.deleteContents();
      r.insertNode(document.createTextNode(text));
      r.collapse(false);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    }
  }
}

// ---- imágenes al portapapeles ----

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'image/jpeg';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** El portapapeles solo acepta image/png: se convierte con un canvas (sin tocar la red ni el CSP de la página). */
async function pngBlob(src: string): Promise<Blob> {
  let dataUrl = src;
  if (!src.startsWith('data:')) {
    const res = await browser.runtime.sendMessage({ type: 'fetch-image', url: src }); // lo baja el background (sin CORS)
    if (!res?.dataUrl) throw new Error(res?.error ?? 'no se pudo descargar');
    dataUrl = res.dataUrl;
  }
  const bmp = await createImageBitmap(dataUrlToBlob(dataUrl));
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0);
  bmp.close();
  return await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('sin PNG'))), 'image/png'));
}

async function copyImage(src: string) {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob(src) })]);
}

// ---- interfaz ----

export function initInlineInsert() {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .menu, .toast {
        --bg: rgba(30,30,32,.96); --fg: #f2f2f4; --muted: rgba(235,235,245,.55); --line: rgba(255,255,255,.10);
        --hover: rgba(255,255,255,.10); --chip: rgba(255,255,255,.12); --accent: #ff6259;
        font: 13px/1.35 -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif; color: var(--fg);
      }
      @media (prefers-color-scheme: light) {
        .menu, .toast { --bg: rgba(250,250,252,.98); --fg: #1d1d1f; --muted: rgba(60,60,67,.6); --line: rgba(0,0,0,.10); --hover: rgba(0,0,0,.06); --chip: rgba(0,0,0,.07); }
      }
      .menu {
        position: fixed; width: 380px; max-width: calc(100vw - 16px); max-height: 340px; overflow: auto; padding: 5px;
        background: var(--bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 14px 40px rgba(0,0,0,.45);
      }
      .menu[hidden], .toast[hidden] { display: none; }
      .row { display: flex; align-items: center; gap: 8px; padding: 7px 9px; border-radius: 8px; cursor: pointer; }
      .row.sel { background: var(--hover); box-shadow: inset 2px 0 0 var(--accent); }
      .txt { flex: 1; min-width: 0; }
      .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .sub { color: var(--muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .count { color: var(--muted); font-size: 11px; }
      .chips { display: flex; gap: 4px; flex: none; }
      .chip { border: 0; border-radius: 6px; padding: 2px 6px; background: var(--chip); color: inherit; font: inherit; font-size: 11px; cursor: pointer; }
      .chip:hover { background: var(--accent); color: #fff; }
      .head { padding: 4px 9px 6px; color: var(--muted); font-size: 11px; }
      .foot { padding: 6px 9px 3px; border-top: 1px solid var(--line); margin-top: 4px; color: var(--muted); font-size: 11px; }
      .toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); padding: 9px 14px; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.4); }
    </style>
    <div class="menu" hidden></div>
    <div class="toast" hidden></div>`;
  const menu = shadow.querySelector<HTMLDivElement>('.menu')!;
  const toast = shadow.querySelector<HTMLDivElement>('.toast')!;
  document.documentElement.append(host);

  let field: Field | null = null;
  let token = '';
  let rows: Row[] = [];
  let sel = 0;
  let seq = 0; // descarta respuestas viejas si se sigue escribiendo mientras se leen las notas
  let toastTimer: number | undefined;

  const isOpen = () => !menu.hidden;
  const close = () => {
    seq++;
    menu.hidden = true;
    rows = [];
  };
  const flash = (text: string) => {
    toast.textContent = text;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (toast.hidden = true), 2600);
  };

  const noteText = (b: Bookmark, prefer: 'note' | 'quote') => {
    const a = (b.note ?? '').trim();
    const q = (b.quote ?? '').trim();
    return prefer === 'quote' ? q || a : a || q;
  };

  const place = () => {
    if (!field) return;
    let r: DOMRect | undefined;
    try {
      const sel0 = window.getSelection();
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) && sel0?.rangeCount) {
        const rr = sel0.getRangeAt(0);
        r = rr.getClientRects()[0] ?? rr.getBoundingClientRect();
        if (r && !r.width && !r.height && !r.top) r = undefined;
      }
    } catch {
      /* sin rango: se usa el campo */
    }
    r ??= field.getBoundingClientRect(); // en input/textarea no hay API para el cursor: se ancla al campo
    const h = menu.offsetHeight || 200;
    const w = menu.offsetWidth || 380;
    const below = r.bottom + 6;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : below;
    menu.style.top = `${Math.round(top)}px`;
    menu.style.left = `${Math.round(Math.min(Math.max(8, r.left), window.innerWidth - w - 8))}px`;
  };

  const render = () => {
    menu.replaceChildren();
    const q = queryOf(token);
    const head = document.createElement('div');
    head.className = 'head';
    head.textContent = rows.some((r) => r.kind === 'note') ? `📁 ${cleanFolderPath(q) ?? q}` : 'Carpetas';
    menu.append(head);

    rows.forEach((row, i) => {
      const el = document.createElement('div');
      el.className = 'row' + (i === sel ? ' sel' : '');
      const txt = document.createElement('div');
      txt.className = 'txt';
      const name = document.createElement('div');
      name.className = 'name';
      const sub = document.createElement('div');
      sub.className = 'sub';
      if (row.kind === 'folder') {
        name.textContent = `🗂️ ${row.path}`;
        sub.textContent = 'Tab/Enter para abrirla';
        const c = document.createElement('span');
        c.className = 'count';
        c.textContent = String(row.count);
        txt.append(name, sub);
        el.append(txt, c);
      } else {
        const b = row.note;
        const text = (b.note || b.quote || b.title || '').replace(/\s+/g, ' ').trim();
        name.textContent = text ? text.slice(0, 120) : `🖼 ${row.images.length} imagen${row.images.length === 1 ? '' : 'es'}`;
        sub.textContent = [b.quote && b.note ? '« cita » (Alt+Enter)' : '', (() => { try { return new URL(b.url).host; } catch { return ''; } })()].filter(Boolean).join(' · ');
        txt.append(name, sub);
        el.append(txt);
        if (row.images.length) {
          const chips = document.createElement('div');
          chips.className = 'chips';
          row.images.slice(0, 5).forEach((src, n) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'chip';
            chip.textContent = `🖼${n + 1}`;
            chip.title = 'Copiar esta imagen (luego Ctrl+V)';
            chip.addEventListener('mousedown', (e) => {
              e.preventDefault();
              e.stopPropagation();
              void doCopyImage(src);
            });
            chips.append(chip);
          });
          if (row.images.length > 5) {
            const more = document.createElement('span');
            more.className = 'count';
            more.textContent = `+${row.images.length - 5}`;
            chips.append(more);
          }
          el.append(chips);
        }
      }
      // mousedown (no click) + preventDefault: el campo de texto no pierde el foco ni el cursor
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        sel = i;
        void act(row, { alt: e.altKey, shift: e.shiftKey });
      });
      menu.append(el);
    });

    const foot = document.createElement('div');
    foot.className = 'foot';
    foot.textContent = '↑↓ elegir · Enter insertar · ⇧Enter copiar imagen · Esc cerrar';
    menu.append(foot);
    menu.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  };

  const doCopyImage = async (src: string) => {
    const f = field;
    const t = token;
    close();
    try {
      await copyImage(src);
      if (f) replaceToken(f, t, ''); // quita el comando del campo
      flash('🖼 Imagen copiada · pégala con Ctrl+V');
    } catch (err) {
      flash(`No se pudo copiar la imagen (${err instanceof Error ? err.message : 'error'})`);
    }
  };

  const act = async (row: Row, mods: { alt: boolean; shift: boolean }) => {
    const f = field;
    if (!f) return;
    if (row.kind === 'folder') {
      // completa el comando con la ruta: eso vuelve a disparar la lista, ahora con sus notas
      replaceToken(f, token, /\s/.test(row.path) ? `/"${row.path}"` : `/${row.path}`);
      return;
    }
    const b = row.note;
    if (mods.shift && row.images.length) return doCopyImage(row.images[0]);
    const text = noteText(b, mods.alt ? 'quote' : 'note');
    if (!text) {
      if (row.images.length) return doCopyImage(row.images[0]); // nota solo con imágenes
      return;
    }
    const t = token;
    close();
    replaceToken(f, t, text);
  };

  const evaluate = async (el: Field) => {
    const my = ++seq;
    const before = textBeforeCaret(el);
    const m = before === null ? null : TOKEN.exec(before);
    if (!m || queryOf(m[1]).length < MIN_QUERY || !(await isEnabled())) return close();
    const idx = await loadIndex();
    if (my !== seq) return;
    const next = buildRows(idx, queryOf(m[1]));
    if (!next.length) return close();
    field = el;
    token = m[1];
    rows = next;
    sel = Math.min(sel, rows.length - 1);
    menu.hidden = false;
    render();
    place();
  };

  // el evento `input` cubre teclear, pegar, autocompletar y nuestras propias inserciones
  document.addEventListener(
    'input',
    (e) => {
      const target = e.composedPath()[0];
      if (!(target instanceof Node) || target.getRootNode() !== document) return; // ni Shadow DOM ajeno ni el cuadro de nota de la extensión
      const el = editableOf(target);
      if (!el) return;
      sel = 0;
      void evaluate(el);
    },
    true,
  );

  document.addEventListener(
    'keydown',
    (e) => {
      if (!isOpen() || e.isComposing) return;
      const swallow = () => {
        e.preventDefault();
        e.stopImmediatePropagation(); // la página no ve la tecla (p. ej. Enter = enviar mensaje)
      };
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        swallow();
        sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
        render();
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        const row = rows[sel];
        if (!row) return close();
        swallow();
        void act(row, { alt: e.altKey, shift: e.shiftKey });
      } else if (e.key === 'Escape') {
        swallow();
        close();
      } else if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
        close(); // el cursor se movió: ya no se está escribiendo el comando
      }
    },
    true,
  );

  document.addEventListener('mousedown', (e) => !e.composedPath().includes(host) && isOpen() && close(), true);
  document.addEventListener('focusout', () => window.setTimeout(() => isOpen() && !shadow.activeElement && field && document.activeElement !== field && close(), 120), true);
  window.addEventListener('scroll', () => isOpen() && place(), true);
  window.addEventListener('resize', () => isOpen() && place());
}
