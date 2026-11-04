const MAX_QUOTE = 2000;

/** Colapsa espacios/saltos y recorta. Devuelve '' si no hay texto. */
export function normalizeQuote(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, MAX_QUOTE);
}

// '-' y ',' son delimitadores del text fragment, así que hay que codificarlos siempre
const enc = (s: string) => encodeURIComponent(s).replace(/-/g, '%2D');

/**
 * Enlace que, al abrirlo, hace que Chrome desplace y resalte el texto citado
 * (Text Fragments: #:~:text=...). Si algo falla devuelve la URL original.
 */
export function textFragmentUrl(url: string, quote: string): string {
  try {
    const q = normalizeQuote(quote);
    if (!q) return url;
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return url;

    const words = q.split(' ');
    const directive =
      words.length <= 12
        ? enc(q)
        : `${enc(words.slice(0, 6).join(' '))},${enc(words.slice(-6).join(' '))}`;

    u.hash = ''; // un hash previo estorba al fragmento
    return `${u.toString()}#:~:text=${directive}`;
  } catch {
    return url;
  }
}
