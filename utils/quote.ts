const MAX_QUOTE = 2000;

/** Colapsa espacios/saltos y recorta. Devuelve '' si no hay texto. */
export function normalizeQuote(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, MAX_QUOTE);
}

// '-' y ',' son delimitadores del text fragment, así que hay que codificarlos siempre
const enc = (s: string) => encodeURIComponent(s).replace(/-/g, '%2D');

/**
 * Directiva de text fragment a partir de los trozos de la selección (uno por bloque de la página).
 * Chrome solo encuentra texto dentro de UN bloque; con la forma "inicio,fin" cada extremo puede estar
 * en un bloque distinto (p. ej. etiquetas inline-block/flex), y lo de en medio se resalta igual.
 */
export function fragmentFromSegments(segs: string[]): string | null {
  if (!segs.length) return null;
  if (segs.length === 1) {
    const w = segs[0].split(' ');
    return w.length <= 12 ? enc(segs[0]) : `${enc(w.slice(0, 6).join(' '))},${enc(w.slice(-6).join(' '))}`;
  }
  const first = segs[0].split(' ').slice(0, 6).join(' ');
  const last = segs[segs.length - 1].split(' ').slice(-6).join(' ');
  return `${enc(first)},${enc(last)}`;
}

/**
 * Enlace que, al abrirlo, hace que Chrome desplace y resalte el texto citado
 * (Text Fragments: #:~:text=...). Si algo falla devuelve la URL original.
 */
export function textFragmentUrl(url: string, quote: string, fragment?: string | null): string {
  try {
    const q = normalizeQuote(quote);
    if (!q) return url;
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return url;

    // fragment = calculado al guardar (respeta bloques); sin él (notas viejas) se arma solo con el texto
    const words = q.split(' ');
    const directive =
      fragment ||
      (words.length <= 12 ? enc(q) : `${enc(words.slice(0, 6).join(' '))},${enc(words.slice(-6).join(' '))}`);

    u.hash = ''; // un hash previo estorba al fragmento
    return `${u.toString()}#:~:text=${directive}`;
  } catch {
    return url;
  }
}