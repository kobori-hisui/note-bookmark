import { addBookmark } from '@/utils/bookmarks';
import { openEditor } from './editor';
import { cropImage, selectRegion } from './selector';

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

        .cam {
          flex: none; display: inline-flex; align-items: center; gap: 6px;
          padding: 5px 10px; border: 0; border-radius: 999px; cursor: pointer;
          background: var(--chip); color: var(--fg);
          font: 500 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          transition: background .15s, color .15s, transform .1s;
        }
        .cam:hover { background: var(--chip-hover); color: var(--accent); }
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
          <div class="field">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>
            </svg>
            <textarea rows="1" placeholder="Escribe una nota…" spellcheck="false"></textarea>
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

    const KEYS_HTML = `
      <span><kbd>↵</kbd> guardar</span>
      <span><kbd>⇧ ↵</kbd> salto</span>
      <span><kbd>esc</kbd> cerrar</span>`;
    const setKeys = () => (keys.innerHTML = KEYS_HTML);
    setKeys();

    const syncActive = () => spot.classList.toggle('active', textarea.value.length > 0);
    const autosize = () => {
      textarea.style.height = '24px';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
      textarea.style.overflow = textarea.scrollHeight > 160 ? 'auto' : 'hidden';
    };
    const reset = () => {
      textarea.value = '';
      autosize();
      syncActive();
    };

    const show = () => {
      site.textContent = location.hostname;
      host.style.display = 'block'; // reinicia las animaciones
      syncActive();
      textarea.focus();
    };
    const hide = () => {
      host.style.display = 'none';
    };
    const toggle = () => (host.style.display === 'none' ? show() : hide());

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
      const note = textarea.value.trim();
      if (!note) return;
      await addBookmark(note, location.href); // image = null
      reset();
      flash('Guardado ✓', 'ok', hide);
    };

    // Alt+C llega desde el background
    browser.runtime.onMessage.addListener((msg) => {
      if (msg?.type === 'toggle-note') toggle();
    });

    // Clic en el fondo oscuro cierra
    backdrop.addEventListener('mousedown', hide);
    // Clic en la barra enfoca el texto
    field.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      textarea.focus();
    });

    // Evita que atajos de la página roben las teclas
    for (const ev of ['keydown', 'keyup', 'keypress'] as const) {
      textarea.addEventListener(ev, (e) => e.stopPropagation());
    }
    textarea.addEventListener('input', () => {
      autosize();
      syncActive();
    });
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        hide();
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
        show(); // canceló; la nota sigue en el textarea
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
      await addBookmark(result.note, location.href, result.image);
      reset();
    });

    document.body.appendChild(host);
  },
});
