/**
 * Ubica en la página lo que guardó una nota (texto citado o imágenes) y lo marca.
 * No depende de los text fragments de Chrome: busca el texto en el DOM (ignorando espacios y bloques),
 * encuentra las <img> por su URL original y, si todo falla, usa la posición guardada.
 */
export interface LocateTarget {
  quote?: string | null;
  imageSrcs?: string[] | null;
  anchor?: { y: number; h: number } | null; // posición vertical en la página al guardar (y) y alto total (h)
}

const SKIP_TAGS = /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|TEMPLATE)$/;
const IGNORABLE = /[\s\u200b-\u200d\u2060\ufeff]/;

/** Minúsculas y sin espacios: así el texto coincide aunque cruce bloques o tenga saltos distintos. */
function fold(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (!IGNORABLE.test(s[i])) out += s[i].toLowerCase();
  }
  return out;
}

interface TextIndex {
  text: string; // texto visible de la página, "fold"
  nodes: Text[]; // nodo de cada carácter de `text`
  offs: number[]; // posición dentro de ese nodo
}

function buildIndex(): TextIndex {
  const nodes: Text[] = [];
  const offs: number[] = [];
  const parts: string[] = [];
  const visible = new Map<Element, boolean>();
  const isVisible = (el: Element) => {
    let v = visible.get(el);
    if (v === undefined) {
      const cv = (el as unknown as { checkVisibility?: (o: object) => boolean }).checkVisibility;
      v = cv ? cv.call(el, { checkVisibilityCSS: true }) : true;
      visible.set(el, v);
    }
    return v;
  };

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const t = walker.currentNode as Text;
    const el = t.parentElement;
    if (!el || SKIP_TAGS.test(el.tagName) || !isVisible(el)) continue;
    const d = t.data;
    for (let i = 0; i < d.length; i++) {
      if (IGNORABLE.test(d[i])) continue;
      const lc = d[i].toLowerCase();
      for (let k = 0; k < lc.length; k++) {
        parts.push(lc[k]);
        nodes.push(t);
        offs.push(i);
      }
    }
  }
  return { text: parts.join(''), nodes, offs };
}

const pageHeight = () => Math.max(1, document.documentElement.scrollHeight);

function findQuote(quote: string, anchor: LocateTarget['anchor']): Range | null {
  try {
    const q = fold(quote);
    if (!q) return null;
    const idx = buildIndex();
    // si la cita completa no aparece (la página cambió un poco), prueba con su comienzo
    const lengths = q.length > 60 ? [q.length, 60] : [q.length];
    for (const len of lengths) {
      const needle = q.slice(0, len);
      const hits: number[] = [];
      for (let p = idx.text.indexOf(needle); p !== -1 && hits.length < 50; p = idx.text.indexOf(needle, p + 1)) hits.push(p);
      if (!hits.length) continue;

      const mk = (p: number) => {
        const r = document.createRange();
        r.setStart(idx.nodes[p], idx.offs[p]);
        const e = p + needle.length - 1;
        r.setEnd(idx.nodes[e], idx.offs[e] + 1);
        return r;
      };
      if (hits.length === 1 || !anchor) return mk(hits[0]);

      // el texto se repite: elige la aparición más cercana a donde estaba al guardar
      const target = (anchor.y / anchor.h) * pageHeight();
      let best: Range | null = null;
      let bestD = Infinity;
      for (const p of hits) {
        const r = mk(p);
        const d = Math.abs(r.getBoundingClientRect().top + window.scrollY - target);
        if (d < bestD) {
          bestD = d;
          best = r;
        }
      }
      return best;
    }
  } catch {
    // p. ej. DOM que cambió mientras se buscaba
  }
  return null;
}

// ---- imágenes ----

const stem = (seg: string) => seg.replace(/(\.[a-z0-9]{2,5})+$/, ''); // "1t.jpg.webp" -> "1t"

/**
 * Claves de comparación de una URL, de más a menos estricta. Los CDN cambian de subdominio (t1, t3, t5…),
 * de formato (.jpg / .jpg.webp) o de parámetros entre cargas, así que no basta con comparar la URL exacta.
 */
function keysOf(u: string): string[] {
  try {
    const x = new URL(u, location.href);
    let path = x.pathname;
    try {
      path = decodeURIComponent(path);
    } catch {
      // se queda como está
    }
    path = path.toLowerCase();
    const segs = path.split('/').filter(Boolean);
    const keys = [`h:${x.host}${path}`, `p:${path}`];
    if (segs.length >= 2) keys.push(`s:${segs.slice(-2).map(stem).join('/')}`); // carpeta/archivo, sin extensión
    return keys;
  } catch {
    return [`p:${u}`];
  }
}

function imgKeys(img: HTMLImageElement): string[] {
  const urls = [img.currentSrc, img.src];
  for (const a of ['data-src', 'data-original', 'data-lazy-src', 'data-lazy', 'data-url']) urls.push(img.getAttribute(a) ?? '');
  for (const attr of ['srcset', 'data-srcset']) {
    const ss = img.getAttribute(attr);
    if (ss) ss.split(',').forEach((p) => urls.push(p.trim().split(/\s+/)[0]));
  }
  return urls.filter((u) => u && !u.startsWith('data:')).flatMap(keysOf);
}

/** <img> de la página que corresponden a esas URLs (también las de carga perezosa: data-src, srcset…). */
export function findImages(srcs: string[]): HTMLImageElement[] {
  const want = new Set(srcs.filter((s) => /^https?:/i.test(s)).flatMap(keysOf));
  if (!want.size) return [];
  return [...document.images].filter((img) => imgKeys(img).some((k) => want.has(k)));
}

// ---- marcador visual ----

let clearCurrent: (() => void) | null = null;

function showMarker(getRects: () => DOMRect[], toast: string) {
  clearCurrent?.();
  const host = document.createElement('div');
  // posicionado en coordenadas de documento: se mueve con el scroll sin recalcular
  host.style.cssText =
    'position:absolute;left:0;top:0;width:0;height:0;overflow:visible;z-index:2147483646;pointer-events:none;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      .box { position: absolute; box-sizing: border-box; border-radius: 4px; outline: 2px solid #e11d1d;
             background: rgba(255,214,10,.28); animation: pulse 1s ease-in-out 3; }
      @keyframes pulse { 50% { background: rgba(255,214,10,.6); } }
      .toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); padding: 8px 14px; border-radius: 999px;
               background: rgba(30,30,32,.94); color: #f2f2f4; font: 13px system-ui, sans-serif;
               box-shadow: 0 8px 30px rgba(0,0,0,.4); white-space: nowrap; }
    </style>
    <div class="boxes"></div><div class="toast"></div>`;
  (shadow.querySelector('.toast') as HTMLElement).textContent = toast;
  const boxes = shadow.querySelector('.boxes') as HTMLElement;

  const place = () => {
    const o = host.getBoundingClientRect();
    const rects = getRects().slice(0, 40);
    while (boxes.children.length < rects.length) {
      const d = document.createElement('div');
      d.className = 'box';
      boxes.append(d);
    }
    while (boxes.children.length > rects.length) boxes.lastElementChild!.remove();
    rects.forEach((r, i) => {
      const s = (boxes.children[i] as HTMLElement).style;
      s.left = `${r.left - o.left - 3}px`;
      s.top = `${r.top - o.top - 3}px`;
      s.width = `${r.width + 6}px`;
      s.height = `${r.height + 6}px`;
    });
  };

  document.documentElement.append(host);
  place();
  // la página puede seguir acomodándose (imágenes que cargan): recoloca unas veces
  const timers = [400, 1200, 2500, 5000].map((ms) => window.setTimeout(place, ms));
  const toastTimer = window.setTimeout(() => ((shadow.querySelector('.toast') as HTMLElement).hidden = true), 4000);
  const killTimer = window.setTimeout(clear, 15000);
  window.addEventListener('resize', place);
  window.addEventListener('pointerdown', clear, true);
  window.addEventListener('keydown', clear, true);

  function clear() {
    timers.forEach(clearTimeout);
    clearTimeout(toastTimer);
    clearTimeout(killTimer);
    window.removeEventListener('resize', place);
    window.removeEventListener('pointerdown', clear, true);
    window.removeEventListener('keydown', clear, true);
    host.remove();
    clearCurrent = null;
  }
  clearCurrent = clear;
}

const nonEmpty = (r: DOMRect) => r.width > 0 && r.height > 0;

/**
 * Lleva la vista a lo que guardó la nota y lo marca. Reintenta unos segundos (la página puede cargar
 * contenido después) y, si no lo encuentra, deja en la zona aproximada donde se guardó.
 */
export async function locateNote(t: LocateTarget): Promise<void> {
  const deadline = Date.now() + 12000;
  let range: Range | null = null;
  let imgs: HTMLImageElement[] = [];
  let jumped = false;

  for (;;) {
    range = t.quote ? findQuote(t.quote, t.anchor) : null;
    imgs = t.imageSrcs?.length ? findImages(t.imageSrcs) : [];
    if (range || imgs.length || Date.now() > deadline) break;
    if (t.anchor && !jumped) {
      // contenido perezoso / virtualizado: ir a la zona suele hacer que se cargue
      jumped = true;
      window.scrollTo({ top: Math.max(0, (t.anchor.y / t.anchor.h) * pageHeight() - window.innerHeight / 2) });
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  if (range || imgs.length) {
    // una imagen sin cargar puede medir 0: en ese caso se usa el contenedor visible más cercano
    const imgRect = (i: HTMLImageElement) => {
      let el: Element = i;
      let r = i.getBoundingClientRect();
      while (!nonEmpty(r) && el.parentElement && el !== document.body) {
        el = el.parentElement;
        r = el.getBoundingClientRect();
      }
      return r;
    };
    const rects = () =>
      [...(range ? [...range.getClientRects()] : []), ...imgs.map(imgRect)].filter(nonEmpty).sort((a, b) => a.top - b.top);
    const goTo = (behavior: ScrollBehavior) => {
      const f = rects()[0];
      if (f) window.scrollTo({ top: Math.max(0, f.top + window.scrollY - window.innerHeight / 3), behavior });
    };
    goTo('smooth');
    showMarker(rects, '📍 Nota localizada');
    // en blogs largos las imágenes de arriba terminan de cargar y mueven todo: reajusta si se salió de la vista
    for (const ms of [1500, 3500]) {
      window.setTimeout(() => {
        const f = rects()[0];
        if (f && (f.top < 0 || f.top > window.innerHeight * 0.7)) goTo('smooth');
      }, ms);
    }
    return;
  }

  if (t.anchor) {
    const y = (t.anchor.y / t.anchor.h) * pageHeight();
    window.scrollTo({ top: Math.max(0, y - window.innerHeight / 2), behavior: 'smooth' });
    showMarker(() => [new DOMRect(8, y - window.scrollY - 2, window.innerWidth - 16, 4)], '📍 No encontré el elemento exacto; esta es la zona aproximada');
    return;
  }
  showMarker(() => [], 'No pude ubicar la nota en esta página');
}