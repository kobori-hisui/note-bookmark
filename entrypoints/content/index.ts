import { addBookmark, bookmarksItem, type Anchor } from '@/utils/bookmarks';
import { cleanFolderPath, MAX_FOLDER_PATH, notesForPage } from '@/utils/folders';
import { blobToJpegDataUrl } from '@/utils/image';
import { settingsItem, updateSettings, type ImageMode } from '@/utils/settings';
import { fragmentFromSegments, normalizeQuote } from '@/utils/quote';
import { openEditor } from './editor';
import { findImages, locateNote } from './locate';
import { cropImage, selectRegion } from './selector';

/** Texto seleccionado en la página (también dentro de inputs/textarea). */
function readSelection(): string {
  try {
    const ae = document.activeElement;
    if (ae instanceof HTMLInputElement || ae instanceof HTMLTextAreaElement) {
      return normalizeQuote(ae.value.slice(ae.selectionStart ?? 0, ae.selectionEnd ?? 0));
    }
    return normalizeQuote(window.getSelection()?.toString() ?? '');
  } catch {
    return ''; // p. ej. input type=email lanza al leer selectionStart
  }
}

const MAX_IMAGES = 30;

/** URLs de las imágenes dentro de la selección actual + la imagen donde se hizo clic derecho. */
function collectImageSrcs(clicked?: string): string[] {
  const out: string[] = [];
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) {
    for (const img of document.images) {
      if (img.clientWidth < 40 || img.clientHeight < 40) continue; // íconos y píxeles de seguimiento
      if (!sel.containsNode(img, false)) continue; // solo las que están COMPLETAMENTE dentro (no las que rozan el borde)
      const s = img.currentSrc || img.src;
      if (s && !out.includes(s)) out.push(s);
    }
  }
  if (clicked && !out.includes(clicked)) out.unshift(clicked);
  return out.slice(0, MAX_IMAGES);
}

/** Baja una imagen y la devuelve como dataURL JPEG. null si no se pudo. */
async function loadImage(src: string, mode: ImageMode): Promise<string | null> {
  try {
    if (src.startsWith('data:image/')) return src;
    if (src.startsWith('blob:')) return await blobToJpegDataUrl(await (await fetch(src)).blob());
    if (!/^https?:/i.test(src)) return null;
    if (mode === 'url') return src; // solo el enlace: no se descarga nada
    const res = await browser.runtime.sendMessage({ type: 'fetch-image', url: src }); // lo baja el background (sin CORS)
    return typeof res?.dataUrl === 'string' ? res.dataUrl : null;
  } catch {
    return null;
  }
}

/**
 * Comando de carpeta al inicio de la nota: "/news texto" guarda ESA nota en la carpeta "news" (se crea si no existe).
 * Con niveles: "/notes-init/case-use texto" (cada "/" baja un nivel; hasta 5). Con espacios: /"mi tesis/cap 1" texto.
 * Solo "/news" cambia la carpeta activa. Ojo: una nota que empiece con una ruta tipo "/usr/bin" se lee como carpeta.
 */
const FOLDER_CMD = new RegExp(`^\\/(?:"([^"]{1,${MAX_FOLDER_PATH}})"|([^\\s"]{1,${MAX_FOLDER_PATH}}))(?=\\s|$)\\s*([\\s\\S]*)$`);
function parseFolderCmd(raw: string): { folder: string | null; note: string } {
  const m = FOLDER_CMD.exec(raw.trimStart());
  if (!m) return { folder: null, note: raw.trim() };
  const folder = cleanFolderPath(m[1] ?? m[2]);
  if (!folder) return { folder: null, note: raw.trim() }; // "//" u otra ruta vacía: no es un comando
  return { folder, note: m[3].trim() };
}

const httpSrc = (s: string) => (/^https?:/i.test(s) ? s : '');
const docHeight = () => Math.max(1, document.documentElement.scrollHeight);

/** Dónde está (en la página) lo que se va a guardar: la selección o la imagen clicada. Respaldo para ubicar la nota. */
function computeAnchor(clickedSrc?: string): Anchor | null {
  try {
    let top: number | null = null;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.rangeCount) {
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (r.width || r.height) top = r.top;
    }
    if (top === null && clickedSrc) {
      const img = findImages([clickedSrc])[0];
      if (img) top = img.getBoundingClientRect().top;
    }
    return top === null ? null : { y: Math.round(top + window.scrollY), h: docHeight() };
  } catch {
    return null;
  }
}

/** Sin selección ni imagen: la zona que se está viendo. */
const viewportAnchor = (): Anchor => ({ y: Math.round(window.scrollY + window.innerHeight / 2), h: docHeight() });

/** Bloque (para el buscador de text fragments) al que pertenece un nodo: el primer ancestro que no sea inline. */
function blockOf(node: Node): Element | null {
  let el: Element | null = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  while (el && /^(inline|contents|ruby|ruby-text)$/.test(getComputedStyle(el).display)) el = el.parentElement;
  return el;
}

/** Texto de la selección partido por bloques de la página (cada etiqueta inline-block/flex cuenta como un bloque). */
function selectionSegments(): string[] {
  try {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return [];
    const range = sel.getRangeAt(0);
    const ca = range.commonAncestorContainer;
    const root = ca.nodeType === Node.ELEMENT_NODE ? ca : ca.parentNode;
    if (!root) return [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const segs: string[] = [];
    let lastBlock: Element | null = null;
    while (walker.nextNode()) {
      const t = walker.currentNode as Text;
      if (!range.intersectsNode(t)) continue;
      if (/^(SCRIPT|STYLE|NOSCRIPT)$/.test(t.parentElement?.tagName ?? '')) continue;
      let text = t.data;
      if (t === range.endContainer) text = text.slice(0, range.endOffset);
      if (t === range.startContainer) text = text.slice(range.startOffset);
      if (!text.trim()) continue;
      const b = blockOf(t);
      if (!segs.length || b !== lastBlock) segs.push(text);
      else segs[segs.length - 1] += text;
      lastBlock = b;
    }
    return segs.map(normalizeQuote).filter(Boolean);
  } catch {
    return [];
  }
}

/** Título y favicon de la página, para guardarlos junto a la nota. */
function pageMeta(): { title: string | null; favicon: string | null } {
  const title = (document.title || '').trim().slice(0, 300) || null;
  const candidates = [
    document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href,
    `${location.origin}/favicon.ico`,
  ];
  for (const c of candidates) {
    try {
      if (c && /^https?:$/.test(new URL(c).protocol)) return { title, favicon: c };
    } catch {
      // URL inválida (p. ej. origin "null" en file://)
    }
  }
  return { title, favicon: null };
}

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    // El host cubre toda la pantalla: da el fondo oscurecido + centra la barra
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:none;';
    const shadow = host.attachShadow({ mode: 'open' });

    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; }

        .backdrop {
          position: absolute; inset: 0;
          background: rgba(0, 0, 0, .55);
          -webkit-backdrop-filter: blur(2px);
          backdrop-filter: blur(2px);
          animation: fade .18s ease-out;
        }
        .stage {
          position: absolute; top: 18vh; left: 0; right: 0;
          display: flex; justify-content: center; pointer-events: none;
        }

        .spot {
          --bg: rgba(30, 30, 32, .86);
          --field: rgba(255, 255, 255, .11);
          --fg: #f2f2f4;
          --muted: rgba(235, 235, 245, .50);
          --line: rgba(255, 255, 255, .09);
          --chip: rgba(255, 255, 255, .10);
          --chip-hover: rgba(255, 255, 255, .18);
          --accent: #ff6259;

          pointer-events: auto;
          width: min(640px, 92vw);
          padding: 8px;
          color: var(--fg);
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
          background: var(--bg);
          -webkit-backdrop-filter: blur(30px) saturate(160%);
          backdrop-filter: blur(30px) saturate(160%);
          border: 1px solid var(--line);
          border-radius: 18px;
          box-shadow: 0 24px 70px rgba(0,0,0,.5), 0 0 0 .5px rgba(0,0,0,.6);
          animation: pop .18s cubic-bezier(.2, .9, .25, 1);
        }
        @media (prefers-color-scheme: light) {
          .backdrop { background: rgba(0, 0, 0, .32); }
          .spot {
            --bg: rgba(248, 248, 250, .86);
            --field: rgba(0, 0, 0, .06);
            --fg: #1d1d1f;
            --muted: rgba(60, 60, 67, .55);
            --line: rgba(0, 0, 0, .08);
            --chip: rgba(0, 0, 0, .07);
            --chip-hover: rgba(0, 0, 0, .13);
            box-shadow: 0 24px 70px rgba(0,0,0,.3), 0 0 0 .5px rgba(0,0,0,.18);
          }
        }
        @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pop {
          from { opacity: 0; transform: translateY(-8px) scale(.98); }
          to   { opacity: 1; transform: none; }
        }

        /* Notas que ya hay en esta página (Alt+S) */
        .prev { padding: 4px 6px 10px; }
        .prev[hidden] { display: none; }
        .phead { display: flex; justify-content: space-between; align-items: center; padding: 0 2px 6px;
                 font-size: 12px; color: var(--muted); }
        .px { flex: none; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 6px; cursor: pointer;
              background: transparent; color: var(--muted); font-size: 11px; line-height: 20px; }
        .px:hover { background: var(--chip); color: var(--fg); }
        .plist { max-height: 38vh; overflow: auto; display: flex; flex-direction: column; gap: 6px; }
        .pitem { background: var(--field); border-radius: 10px; padding: 8px 10px; font-size: 13px; line-height: 1.4; cursor: pointer; }
        .pitem:hover { background: var(--chip-hover); }
        .pq { border-left: 3px solid var(--accent); padding-left: 8px; margin-bottom: 4px; color: var(--muted);
              font-style: italic; word-break: break-word; overflow: hidden;
              display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
        .pn { white-space: pre-wrap; word-break: break-word; }
        .pd { margin-top: 4px; font-size: 11px; color: var(--muted); }
        .pempty { padding: 4px 2px; font-size: 13px; color: var(--muted); }

        /* Referencia: texto seleccionado en la página */
        .quote { display: flex; align-items: flex-start; gap: 10px; padding: 4px 6px 10px 8px;
                 font-size: 13px; line-height: 1.45; color: var(--muted); }
        .quote[hidden] { display: none; }
        .qbar { flex: none; width: 3px; align-self: stretch; border-radius: 2px; background: var(--accent); }
        .qtext { flex: 1; min-width: 0; font-style: italic; word-break: break-word; overflow: hidden;
                 display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
        .qx { flex: none; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 6px; cursor: pointer;
              background: transparent; color: var(--muted); font-size: 11px; line-height: 20px; }
        .qx:hover { background: var(--chip); color: var(--fg); }

        /* Imágenes de la página adjuntas a la nota */
        .imgs { display: flex; align-items: center; gap: 10px; padding: 4px 6px 10px 8px; }
        .imgs[hidden] { display: none; }
        .ithumbs { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; gap: 6px; max-height: 128px; overflow: auto; }
        .thumb { position: relative; flex: none; width: 56px; height: 56px; border-radius: 8px; overflow: hidden; background: var(--field); }
        .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .thumb.broken { display: grid; place-items: center; }
        .thumb.broken::before { content: '🖼'; font-size: 20px; color: var(--muted); }
        .thumb button { position: absolute; top: 2px; right: 2px; width: 16px; height: 16px; padding: 0; border: 0; border-radius: 50%;
                        cursor: pointer; background: rgba(0,0,0,.65); color: #fff; font-size: 9px; line-height: 16px; }
        .thumb button:hover { background: var(--accent); }
        .istatus { flex: none; font-size: 12px; color: var(--muted); }

        .field {
          display: flex; align-items: center; gap: 12px;
          min-height: 48px; padding: 0 12px 0 14px;
          background: var(--field); border-radius: 12px; cursor: text;
        }
        .icon { flex: none; width: 20px; height: 20px; color: var(--muted); }

        textarea {
          flex: 1; min-width: 0; height: 24px; max-height: 160px;
          margin: 12px 0; padding: 0; border: 0; outline: 0; resize: none; overflow: hidden;
          background: transparent; color: inherit; caret-color: var(--accent);
          font: 400 16px/24px -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
        }
        textarea::placeholder { color: var(--muted); }

        .cam, .fbtn {
          flex: none; display: inline-flex; align-items: center; gap: 6px;
          padding: 5px 10px; border: 0; border-radius: 999px; cursor: pointer;
          background: var(--chip); color: var(--fg);
          font: 500 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          transition: background .15s, color .15s, transform .1s;
        }
        .cam:hover, .fbtn:hover { background: var(--chip-hover); color: var(--accent); }
        .fbtn.on { color: var(--accent); }
        .fbtn .fl { max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* Selector de carpeta (Tab) */
        .fpick { padding: 4px 6px 10px; }
        .fpick[hidden] { display: none; }
        .finput { width: 100%; height: 36px; padding: 0 12px; border: 0; outline: 0; border-radius: 10px;
                  background: var(--field); color: inherit; caret-color: var(--accent);
                  font: 400 14px/36px -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; }
        .finput::placeholder { color: var(--muted); }
        .fopts { margin-top: 6px; max-height: 200px; overflow: auto; display: flex; flex-direction: column; gap: 2px; }
        .fopt { display: flex; justify-content: space-between; gap: 8px; padding: 7px 10px; border-radius: 8px;
                font-size: 13px; cursor: pointer; }
        .fopt small { color: var(--muted); }
        .fopt.sel, .fopt:hover { background: var(--chip-hover); }
        .fhint { padding: 6px 10px; font-size: 12px; color: var(--muted); }
        .cam:active { transform: scale(.96); }
        .cam svg { width: 14px; height: 14px; }

        .enter {
          flex: none; display: grid; place-items: center; width: 26px; height: 26px;
          border: 0; border-radius: 7px; background: transparent; color: var(--muted); cursor: pointer;
          transition: color .15s, background .15s;
        }
        .enter svg { width: 18px; height: 18px; }
        .spot.active .enter { color: var(--fg); }
        .enter:hover { background: var(--chip); }

        .foot {
          display: flex; justify-content: space-between; align-items: center; gap: 12px;
          max-height: 0; opacity: 0; padding: 0 8px; overflow: hidden;
          font-size: 12px; color: var(--muted);
          transition: max-height .18s ease, opacity .18s ease, padding .18s ease;
        }
        .spot.active .foot { max-height: 40px; opacity: 1; padding: 10px 8px 4px; }

        .keys { display: flex; align-items: center; gap: 14px; }
        .keys span { display: inline-flex; align-items: center; gap: 6px; }
        kbd {
          font: 500 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          padding: 2px 6px; border-radius: 5px; background: var(--chip); color: var(--fg);
        }
        .site { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 40%; }
        .ok { color: #32d74b; font-weight: 500; }
        .err { color: #ff453a; font-weight: 500; }
      </style>

      <div class="backdrop"></div>
      <div class="stage">
        <div class="spot">
          <div class="prev" hidden>
            <div class="phead">
              <span class="ptitle"></span>
              <button class="px" title="Cerrar lista">✕</button>
            </div>
            <div class="plist"></div>
          </div>
          <div class="quote" hidden>
            <span class="qbar"></span>
            <span class="qtext"></span>
            <button class="qx" title="Quitar referencia">✕</button>
          </div>
          <div class="imgs" hidden>
            <div class="ithumbs"></div>
            <span class="istatus"></span>
          </div>
          <div class="fpick" hidden>
            <input class="finput" placeholder="Buscar o crear carpeta…" spellcheck="false" />
            <div class="fopts"></div>
          </div>
          <div class="field">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>
            </svg>
            <textarea rows="1" placeholder="Escribe una nota…  ·  /carpeta nota" spellcheck="false"></textarea>
            <button class="fbtn" title="Carpeta donde se guarda (Tab)">📁 <span class="fl">Carpeta</span></button>
            <button class="cam" title="Capturar una región de la página">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/>
                <circle cx="12" cy="12" r="2.5"/>
              </svg>
              Región
            </button>
            <button class="enter" title="Guardar (Enter)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 4v7a4 4 0 0 1-4 4H4"/><path d="m9 10-5 5 5 5"/>
              </svg>
            </button>
          </div>
          <div class="foot">
            <div class="keys"></div>
            <span class="site"></span>
          </div>
        </div>
      </div>
    `;

    const $ = <T extends Element>(sel: string) => shadow.querySelector(sel) as T;
    const backdrop = $<HTMLDivElement>('.backdrop');
    const spot = $<HTMLDivElement>('.spot');
    const field = $<HTMLDivElement>('.field');
    const textarea = $<HTMLTextAreaElement>('textarea');
    const camBtn = $<HTMLButtonElement>('.cam');
    const enterBtn = $<HTMLButtonElement>('.enter');
    const keys = $<HTMLDivElement>('.keys');
    const site = $<HTMLSpanElement>('.site');
    const quoteBox = $<HTMLDivElement>('.quote');
    const quoteText = $<HTMLSpanElement>('.qtext');
    const quoteClear = $<HTMLButtonElement>('.qx');
    const prevBox = $<HTMLDivElement>('.prev');
    const prevTitle = $<HTMLSpanElement>('.ptitle');
    const prevList = $<HTMLDivElement>('.plist');
    const prevClose = $<HTMLButtonElement>('.px');
    const imgsBox = $<HTMLDivElement>('.imgs');
    const imgThumbs = $<HTMLDivElement>('.ithumbs');
    const imgStatus = $<HTMLSpanElement>('.istatus');
    const fpick = $<HTMLDivElement>('.fpick');
    const fInput = $<HTMLInputElement>('.finput');
    const fOpts = $<HTMLDivElement>('.fopts');
    const folderBtn = $<HTMLButtonElement>('.fbtn');
    const folderLabelEl = $<HTMLSpanElement>('.fl');

    const PLACEHOLDER = 'Escribe una nota…  ·  /carpeta nota';
    const PLACEHOLDER_QUOTE = 'Añade una nota sobre esta cita…';

    // Texto de la página al que se refiere la nota (se captura al abrir con Alt+C)
    let quote: string | null = null;
    let fragment: string | null = null; // text fragment calculado al seleccionar (ver selectionSegments)
    let anchor: Anchor | null = null; // posición en la página de lo que se guarda
    // Imágenes de la página adjuntas (clic derecho sobre una imagen o sobre una selección con imágenes)
    let images: { src: string; data: string }[] = [];
    let loading = 0;
    let pending: Promise<void> = Promise.resolve(); // descargas en curso; guardar espera a que terminen

    const KEYS_HTML = `
      <span><kbd>↵</kbd> guardar</span>
      <span><kbd>⇧ ↵</kbd> salto</span>
      <span><kbd>⇥</kbd> carpeta</span>
      <span><kbd>esc</kbd> cerrar</span>`;
    const setKeys = () => (keys.innerHTML = KEYS_HTML);
    setKeys();

    const syncActive = () => spot.classList.toggle('active', textarea.value.length > 0 || !!quote || images.length > 0);
    const setQuote = (q: string | null) => {
      quote = q;
      if (!q) fragment = null;
      quoteBox.hidden = !q;
      quoteText.textContent = q ?? '';
      quoteText.title = q ?? '';
      textarea.placeholder = q ? PLACEHOLDER_QUOTE : PLACEHOLDER;
      syncActive();
    };
    const renderImages = () => {
      imgsBox.hidden = !images.length && !loading;
      imgThumbs.replaceChildren(
        ...images.map((it, i) => {
          const t = document.createElement('div');
          t.className = 'thumb';
          const im = document.createElement('img');
          im.referrerPolicy = 'no-referrer';
          // en páginas con CSP estricta el enlace remoto puede no mostrarse: la nota se guarda igual
          im.onerror = () => {
            t.classList.add('broken');
            im.remove();
          };
          im.src = it.data;
          im.alt = '';
          const x = document.createElement('button');
          x.textContent = '✕';
          x.title = 'Quitar imagen';
          x.addEventListener('click', () => {
            images.splice(i, 1);
            renderImages();
            textarea.focus();
          });
          t.append(im, x);
          return t;
        }),
      );
      imgStatus.textContent = loading
        ? `Descargando ${loading}…`
        : images.length
          ? `${images.length} imagen${images.length === 1 ? '' : 'es'}`
          : '';
      syncActive();
    };
    const addImages = (srcs: string[]) => {
      const fresh = [...new Set(srcs)].filter((s) => !images.some((i) => i.src === s));
      if (!fresh.length) return;
      loading += fresh.length;
      renderImages();
      const job = (async () => {
        const { imageMode } = await settingsItem.getValue(); // 'url' (por defecto) o 'offline'
        const res = await Promise.all(
          fresh.map(async (src) => {
            const data = await loadImage(src, imageMode);
            loading--;
            renderImages();
            return data ? { src, data } : null;
          }),
        );
        const ok = res.filter((r): r is { src: string; data: string } => r !== null);
        for (const r of ok) if (!images.some((i) => i.src === r.src)) images.push(r);
        renderImages();
        if (ok.length < res.length) flash(`${res.length - ok.length} sin descargar`, 'err');
      })();
      pending = pending.then(() => job);
    };
    const autosize = () => {
      textarea.style.height = '24px';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
      textarea.style.overflow = textarea.scrollHeight > 160 ? 'auto' : 'hidden';
    };
    const reset = () => {
      textarea.value = '';
      autosize();
      setQuote(null);
      anchor = null;
      images = [];
      renderImages();
      refreshFolderBtn();
    };

    // ---- carpeta manual (Tab o botón 📁): elegir una existente o crear otra; queda como carpeta activa ----
    let activeFolder: string | null = null;
    let folderNames: { name: string; count: number; latest: number }[] = [];
    type FolderOpt = { label: string; sub?: string; value: string | null };
    let fopts: FolderOpt[] = [];
    let fsel = 0;

    const refreshFolderBtn = () => {
      const inline = parseFolderCmd(textarea.value).folder; // "/carpeta" escrito al inicio de la nota
      const shown = inline ?? activeFolder;
      folderLabelEl.textContent = shown ?? 'Carpeta';
      folderBtn.classList.toggle('on', !!shown);
      folderBtn.title = inline
        ? `Esta nota irá a «${inline}»`
        : activeFolder
          ? `Guardando en «${activeFolder}» (Tab para cambiar)`
          : 'Carpeta donde se guarda (Tab)';
    };
    const setActiveFolder = async (name: string | null) => {
      activeFolder = name;
      refreshFolderBtn();
      await updateSettings({ activeFolder: name });
    };
    settingsItem.getValue().then((s) => {
      activeFolder = s.activeFolder ?? null;
      refreshFolderBtn();
    });
    settingsItem.watch((s) => {
      activeFolder = s?.activeFolder ?? null; // se sincroniza entre pestañas
      refreshFolderBtn();
    });

    const loadFolderNames = async () => {
      const m = new Map<string, { name: string; count: number; latest: number }>();
      // cada nota suma a su carpeta y a todas las de arriba ("a/b/c" cuenta en "a", "a/b" y "a/b/c")
      const add = (path: string, t: number) => {
        const segs = path.split('/');
        for (let i = 1; i <= segs.length; i++) {
          const n = segs.slice(0, i).join('/');
          const k = n.toLowerCase();
          const g = m.get(k);
          if (!g) m.set(k, { name: n, count: 1, latest: t });
          else {
            g.count++;
            if (t > g.latest) {
              g.latest = t;
              g.name = n;
            }
          }
        }
      };
      for (const b of await bookmarksItem.getValue()) {
        const n = cleanFolderPath(b.folder);
        if (n) add(n, Date.parse(b.date) || 0);
      }
      // carpeta recién creada que aún no tiene notas (y sus niveles superiores)
      if (activeFolder) {
        const segs = activeFolder.split('/');
        for (let i = 1; i <= segs.length; i++) {
          const n = segs.slice(0, i).join('/');
          if (!m.has(n.toLowerCase())) m.set(n.toLowerCase(), { name: n, count: 0, latest: Infinity });
        }
      }
      folderNames = [...m.values()].sort((a, b) => b.latest - a.latest);
    };

    const renderFolderOpts = () => {
      if (!fopts.length) {
        const h = document.createElement('div');
        h.className = 'fhint';
        h.textContent = 'Escribe un nombre para crear una carpeta.';
        fOpts.replaceChildren(h);
        return;
      }
      fOpts.replaceChildren(
        ...fopts.map((o, i) => {
          const d = document.createElement('div');
          d.className = 'fopt' + (i === fsel ? ' sel' : '');
          const l = document.createElement('span');
          const current = o.value !== null && activeFolder?.toLowerCase() === o.value.toLowerCase();
          l.textContent = (current ? '✓ ' : '') + o.label;
          d.append(l);
          if (o.sub) {
            const s = document.createElement('small');
            s.textContent = o.sub;
            d.append(s);
          }
          d.addEventListener('mousedown', (e) => {
            e.preventDefault();
            chooseFolder(o);
          });
          return d;
        }),
      );
      fOpts.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
    };

    const buildFolderOpts = () => {
      const q = fInput.value.trim();
      const ql = q.toLowerCase();
      fopts = folderNames
        .filter((f) => f.name.toLowerCase().includes(ql))
        .sort((a, b) => Number(b.name.toLowerCase().startsWith(ql)) - Number(a.name.toLowerCase().startsWith(ql))) // empiezan por lo escrito primero
        .map((f) => ({ label: f.name, sub: f.count ? `${f.count} nota${f.count === 1 ? '' : 's'}` : 'nueva', value: f.name }));
      const created = cleanFolderPath(q); // "a / b" -> "a/b"
      if (created && !folderNames.some((f) => f.name.toLowerCase() === created.toLowerCase())) {
        fopts.push({ label: `➕ Crear «${created}»`, value: created });
      }
      if (activeFolder) fopts.push({ label: 'Sin carpeta fija (automática)', value: null });
      fsel = Math.max(0, Math.min(fsel, fopts.length - 1));
      renderFolderOpts();
    };

    // autocompletar "/carpeta" mientras se escribe en la nota
    const INLINE_PREFIX = /^\/"?([^\s"]*)$/;
    let inlineMode = false;

    const closeFolderPicker = () => {
      fpick.hidden = true;
      inlineMode = false;
      fInput.style.display = '';
      textarea.focus();
    };
    const openFolderPicker = async () => {
      inlineMode = false;
      fInput.style.display = '';
      fpick.hidden = false;
      fInput.value = '';
      fsel = 0;
      await loadFolderNames();
      buildFolderOpts();
      fInput.focus();
    };
    const chooseFolder = async (o: FolderOpt) => {
      if (inlineMode && o.value) {
        // completa el texto: /sisters-friends  (o /"mi tesis"  si tiene espacios)
        textarea.value = /\s/.test(o.value) ? `/"${o.value}" ` : `/${o.value} `;
        closeFolderPicker();
        autosize();
        syncActive();
        refreshFolderBtn();
        return;
      }
      closeFolderPicker();
      await setActiveFolder(o.value);
    };

    const updateInlineSuggest = async () => {
      const m = INLINE_PREFIX.exec(textarea.value);
      if (!m) {
        if (inlineMode) {
          inlineMode = false;
          fpick.hidden = true;
          fInput.style.display = '';
        }
        return;
      }
      inlineMode = true;
      await loadFolderNames();
      if (!inlineMode) return; // el usuario siguió escribiendo y salió del modo mientras cargaba
      const ql = m[1].toLowerCase();
      fopts = folderNames
        .filter((f) => f.name.toLowerCase().includes(ql))
        .sort((a, b) => Number(b.name.toLowerCase().startsWith(ql)) - Number(a.name.toLowerCase().startsWith(ql))) // empiezan por lo escrito primero
        .map((f) => ({ label: f.name, sub: f.count ? `${f.count} nota${f.count === 1 ? '' : 's'}` : 'nueva', value: f.name }));
      fsel = 0;
      fInput.style.display = 'none';
      fpick.hidden = !fopts.length;
      renderFolderOpts();
    };

    folderBtn.addEventListener('click', () => (fpick.hidden ? openFolderPicker() : closeFolderPicker()));
    for (const ev of ['keydown', 'keyup', 'keypress'] as const) fInput.addEventListener(ev, (e) => e.stopPropagation());
    fInput.addEventListener('input', () => {
      fsel = 0;
      buildFolderOpts();
    });
    fInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault();
        closeFolderPicker();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!fopts.length) return;
        fsel = (fsel + (e.key === 'ArrowDown' ? 1 : -1) + fopts.length) % fopts.length;
        renderFolderOpts();
      } else if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        if (fopts[fsel]) chooseFolder(fopts[fsel]);
      }
    });

    // Lista de notas que ya existen en esta página (se abre con Alt+S)
    let prevShown = false;

    const renderPrev = async () => {
      const notes = notesForPage(await bookmarksItem.getValue(), location.href);
      prevTitle.textContent = notes.length
        ? `${notes.length} ${notes.length === 1 ? 'nota' : 'notas'} en esta página`
        : 'Aún no hay notas en esta página';
      if (!notes.length) {
        const none = document.createElement('div');
        none.className = 'pempty';
        none.textContent = 'Escribe la primera abajo.';
        prevList.replaceChildren(none);
        return;
      }
      prevList.replaceChildren(
        ...notes.map((n) => {
          const item = document.createElement('div');
          item.className = 'pitem';
          item.title = 'Ir a esta nota en la página';
          item.addEventListener('click', () => {
            hide();
            locateNote({ quote: n.quote, imageSrcs: n.imageSrcs, anchor: n.anchor });
          });
          if (n.quote) {
            const q = document.createElement('div');
            q.className = 'pq';
            q.textContent = n.quote;
            item.append(q);
          }
          if (n.note) {
            const t = document.createElement('div');
            t.className = 'pn';
            t.textContent = n.note;
            item.append(t);
          }
          const d = document.createElement('div');
          d.className = 'pd';
          const when = new Date(n.date);
          d.textContent = (isNaN(when.getTime()) ? '' : when.toLocaleString()) +
            (n.image ? ' · 📷' : '') +
            (n.images?.length ? ` · 🖼 ${n.images.length}` : '');
          item.append(d);
          return item;
        }),
      );
    };
    const setPrev = async (on: boolean) => {
      prevShown = on;
      prevBox.hidden = !on;
      if (on) await renderPrev();
    };
    prevClose.addEventListener('click', () => {
      setPrev(false);
      textarea.focus();
    });

    const show = () => {
      site.textContent = location.hostname;
      // avisa cuántas notas tiene ya esta página (el detalle se ve con Alt+S)
      bookmarksItem.getValue().then((all) => {
        const n = notesForPage(all, location.href).length;
        if (n) site.textContent = `${location.hostname} · ${n} ${n === 1 ? 'nota' : 'notas'} · Alt+S`;
      });
      host.style.display = 'block'; // reinicia las animaciones
      syncActive();
      textarea.focus();
    };
    const hide = () => {
      host.style.display = 'none';
      fpick.hidden = true;
      prevShown = false;
      prevBox.hidden = true;
    };
    // Al abrir con Alt+C se lee la selección ANTES de enfocar el textarea (enfocar la borraría)
    const open = () => {
      const sel = readSelection();
      if (sel) {
        setQuote(sel);
        fragment = fragmentFromSegments(selectionSegments());
      }
      anchor = computeAnchor() ?? viewportAnchor();
      addImages(collectImageSrcs()); // imágenes dentro de la selección (también antes de enfocar)
      show();
    };
    const toggle = () => (host.style.display === 'none' ? open() : hide());
    // Alt+S: abre el cuadro con la lista de notas previas; si ya está abierto, muestra/oculta la lista
    const toggleNotes = () => {
      if (host.style.display === 'none') {
        open();
        setPrev(true);
      } else {
        setPrev(!prevShown);
      }
    };
    // Clic derecho -> "Guardar selección como nota": abre el cuadro con esa cita ya puesta
    const openWithQuote = (raw: string, srcUrl?: string) => {
      const q = normalizeQuote(raw);
      if (q) {
        setQuote(q);
        fragment = fragmentFromSegments(selectionSegments());
      }
      anchor = computeAnchor(srcUrl) ?? viewportAnchor();
      addImages(collectImageSrcs(srcUrl));
      show();
    };

    const flash = (text: string, cls: 'ok' | 'err', then?: () => void) => {
      keys.innerHTML = `<span class="${cls}">${text}</span>`;
      spot.classList.add('active');
      setTimeout(() => {
        setKeys();
        syncActive();
        then?.();
      }, 800);
    };

    const save = async () => {
      await pending; // espera a que terminen de bajar las imágenes
      const cmd = parseFolderCmd(textarea.value); // "/carpeta nota": carpeta solo para esta nota
      const note = cmd.note;
      if (cmd.folder && !note && !quote && !images.length) {
        // solo "/carpeta" + Enter: cambia la carpeta activa
        textarea.value = '';
        autosize();
        syncActive();
        await setActiveFolder(cmd.folder);
        flash(`📁 ${cmd.folder}`, 'ok');
        return;
      }
      if (!note && !quote && !images.length) return; // se permite guardar solo la cita o solo imágenes
      await addBookmark({
        note,
        url: location.href,
        quote,
        fragment,
        folder: cmd.folder ?? activeFolder,
        images: images.map((i) => i.data),
        imageSrcs: images.map((i) => httpSrc(i.src)),
        anchor: anchor ?? viewportAnchor(),
        ...pageMeta(),
      });
      reset();
      flash('Guardado ✓', 'ok', hide);
    };

    // Alt+C, Alt+S y el menú contextual llegan desde el background
    browser.runtime.onMessage.addListener((msg) => {
      if (msg?.type === 'toggle-note') toggle();
      else if (msg?.type === 'show-notes') toggleNotes();
      else if (msg?.type === 'quote-note') openWithQuote(String(msg.quote ?? ''), typeof msg.srcUrl === 'string' ? msg.srcUrl : undefined);
    });

    // Clic en el fondo oscuro cierra
    backdrop.addEventListener('mousedown', hide);
    // Clic en la barra enfoca el texto
    field.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      textarea.focus();
    });
    quoteClear.addEventListener('click', () => {
      setQuote(null);
      textarea.focus();
    });

    // Evita que atajos de la página roben las teclas
    for (const ev of ['keydown', 'keyup', 'keypress'] as const) {
      textarea.addEventListener(ev, (e) => e.stopPropagation());
    }
    textarea.addEventListener('input', () => {
      autosize();
      syncActive();
      refreshFolderBtn();
      updateInlineSuggest();
    });
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        hide();
        return;
      }
      if (inlineMode && !fpick.hidden && fopts.length) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          fsel = (fsel + (e.key === 'ArrowDown' ? 1 : -1) + fopts.length) % fopts.length;
          renderFolderOpts();
          return;
        }
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !e.isComposing)) {
          e.preventDefault();
          chooseFolder(fopts[fsel]);
          return;
        }
      }
      if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        openFolderPicker(); // Tab = elegir / crear carpeta
        return;
      }
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
      e.preventDefault();
      save();
    });
    enterBtn.addEventListener('click', save);

    // 📷 Región -> seleccionar zona -> recorte -> editor con anotaciones -> guarda con imagen
    camBtn.addEventListener('click', async () => {
      const pendingNote = textarea.value;
      hide(); // que el cuadro y el fondo no salgan en la captura

      const region = await selectRegion();
      if (!region) {
        show(); // canceló; nota y cita siguen ahí
        return;
      }
      await new Promise((r) => setTimeout(r, 150)); // deja repintar sin overlay

      let dataUrl: string | undefined;
      try {
        const res = await browser.runtime.sendMessage({ type: 'capture' });
        dataUrl = res?.dataUrl;
      } catch {
        // se maneja abajo
      }
      if (!dataUrl) {
        show();
        flash('No se pudo capturar', 'err');
        return;
      }

      const cropped = await cropImage(dataUrl, region);
      const result = await openEditor(cropped, pendingNote);
      if (!result) {
        show();
        return;
      }
      await pending;
      const cmd = parseFolderCmd(result.note);
      await addBookmark({
        note: cmd.note,
        url: location.href,
        image: result.image,
        quote,
        fragment,
        folder: cmd.folder ?? activeFolder,
        images: images.map((i) => i.data),
        imageSrcs: images.map((i) => httpSrc(i.src)),
        anchor:
          !quote && !images.length
            ? { y: Math.round(window.scrollY + region.y + region.h / 2), h: docHeight() } // zona de la captura
            : (anchor ?? viewportAnchor()),
        ...pageMeta(),
      });
      reset();
    });

    document.body.appendChild(host);

    // Si esta pestaña se abrió desde el historial, el background tiene una nota que ubicar aquí
    browser.runtime
      .sendMessage({ type: 'content-ready' })
      .then((res) => {
        if (res?.target) locateNote(res.target);
      })
      .catch(() => {});
  },
});