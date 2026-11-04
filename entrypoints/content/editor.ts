export interface EditorResult {
  note: string;
  image: string; // dataURL JPEG
}

type Tool = 'pen' | 'rect' | 'text';
type Shape =
  | { type: 'pen'; color: string; width: number; points: [number, number][] }
  | { type: 'rect'; color: string; width: number; x: number; y: number; w: number; h: number }
  | { type: 'text'; color: string; size: number; x: number; y: number; text: string };

const MAX_W = 1600; // ancho máximo al guardar (reduce peso)

export function openEditor(dataUrl: string, initialNote: string): Promise<EditorResult | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(null);
    img.onload = () => build(img);
    img.src = dataUrl;

    function build(img: HTMLImageElement) {
      const host = document.createElement('div');
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = `
        <style>
          * { box-sizing: border-box; font-family: system-ui, sans-serif; }
          .root { position: fixed; inset: 0; z-index: 2147483647; background: rgba(0,0,0,.9);
                  display: flex; flex-direction: column; color: #eee; font-size: 13px; }
          .bar { display: flex; gap: 8px; align-items: center; padding: 8px 12px; background: #222; height: 48px; }
          button { background: #333; color: #eee; border: 1px solid #444; border-radius: 6px;
                   padding: 6px 10px; cursor: pointer; }
          button.active { border-color: #e11d1d; background: #4a1a1a; }
          input[type=color] { width: 32px; height: 28px; border: none; background: none; padding: 0; cursor: pointer; }
          .sp { flex: 1; }
          .stage { flex: 1; display: flex; align-items: center; justify-content: center; min-height: 0; overflow: auto; }
          .wrap { position: relative; line-height: 0; }
          canvas { display: block; cursor: crosshair; background: #fff; border-radius: 4px; touch-action: none; }
          .txt { position: absolute; background: rgba(255,255,255,.85); border: 1px dashed #e11d1d;
                 outline: none; padding: 0 2px; line-height: 1.2; min-width: 100px; font-weight: 600; }
          .foot { display: flex; gap: 8px; padding: 8px 12px; background: #222; height: 90px; }
          textarea { flex: 1; resize: none; background: #1c1c1c; color: #eee; border: 1px solid #e11d1d;
                     border-radius: 8px; padding: 8px; font-size: 13px; outline: none; }
          .btns { display: flex; flex-direction: column; gap: 6px; }
          .save { background: #e11d1d; border-color: #e11d1d; color: #fff; }
        </style>
        <div class="root">
          <div class="bar">
            <button data-tool="pen" class="active">✏️ Lápiz</button>
            <button data-tool="rect">▭ Rectángulo</button>
            <button data-tool="text">T Texto</button>
            <input type="color" value="#e11d1d" title="Color" />
            <button class="undo">↶ Deshacer</button>
            <span class="sp"></span>
            <span>Esc cancela · Ctrl+Z deshace</span>
          </div>
          <div class="stage"><div class="wrap"><canvas></canvas></div></div>
          <div class="foot">
            <textarea placeholder="Nota… (Enter guarda, Shift+Enter salto)"></textarea>
            <div class="btns">
              <button class="save">Guardar</button>
              <button class="cancel">Cancelar</button>
            </div>
          </div>
        </div>
      `;

      const $ = <T extends Element>(sel: string) => shadow.querySelector(sel) as T;
      const canvas = $<HTMLCanvasElement>('canvas');
      const wrap = $<HTMLDivElement>('.wrap');
      const noteEl = $<HTMLTextAreaElement>('textarea');
      const colorEl = $<HTMLInputElement>('input[type=color]');
      const toolBtns = shadow.querySelectorAll<HTMLButtonElement>('[data-tool]');
      noteEl.value = initialNote;

      // Tamaño real = tamaño de la captura; en pantalla se escala para que quepa
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const availW = window.innerWidth - 24;
      const availH = window.innerHeight - 48 - 90 - 24;
      const scale = Math.min(availW / canvas.width, availH / canvas.height, 1);
      canvas.style.width = `${canvas.width * scale}px`;
      canvas.style.height = `${canvas.height * scale}px`;

      const ctx = canvas.getContext('2d')!;
      const unit = canvas.width / 1000; // grosores relativos a la resolución
      const penW = Math.max(2, 3 * unit);
      const textSize = Math.max(16, 22 * unit);

      let tool: Tool = 'pen';
      let color = '#e11d1d';
      const shapes: Shape[] = [];
      let current: Shape | null = null;

      function drawShape(s: Shape) {
        ctx.strokeStyle = s.color;
        ctx.fillStyle = s.color;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (s.type === 'pen') {
          ctx.lineWidth = s.width;
          ctx.beginPath();
          s.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.stroke();
        } else if (s.type === 'rect') {
          ctx.lineWidth = s.width;
          ctx.strokeRect(s.x, s.y, s.w, s.h);
        } else {
          ctx.font = `600 ${s.size}px system-ui, sans-serif`;
          ctx.textBaseline = 'top';
          ctx.fillText(s.text, s.x, s.y);
        }
      }

      function draw() {
        ctx.drawImage(img, 0, 0);
        shapes.forEach(drawShape);
        if (current) drawShape(current);
      }
      draw();

      const toCanvas = (e: PointerEvent): [number, number] => {
        const r = canvas.getBoundingClientRect();
        return [((e.clientX - r.left) * canvas.width) / r.width, ((e.clientY - r.top) * canvas.height) / r.height];
      };

      function startText(cx: number, cy: number, cssX: number, cssY: number) {
        const input = document.createElement('input');
        input.className = 'txt';
        input.type = 'text';
        input.style.left = `${cssX}px`;
        input.style.top = `${cssY}px`;
        input.style.fontSize = `${Math.max(12, textSize * scale)}px`;
        input.style.color = color;
        const textColor = color;
        let done = false;
        const finish = (commit: boolean) => {
          if (done) return;
          done = true;
          const t = input.value.trim();
          input.remove();
          if (commit && t) {
            shapes.push({ type: 'text', color: textColor, size: textSize, x: cx, y: cy, text: t });
            draw();
          }
        };
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            finish(true);
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            finish(false);
          }
        });
        input.addEventListener('blur', () => finish(true));
        wrap.append(input);
        setTimeout(() => input.focus(), 0);
      }

      canvas.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const [x, y] = toCanvas(e);
        if (tool === 'text') {
          const r = canvas.getBoundingClientRect();
          startText(x, y, e.clientX - r.left, e.clientY - r.top);
          return;
        }
        canvas.setPointerCapture(e.pointerId);
        current =
          tool === 'pen'
            ? { type: 'pen', color, width: penW, points: [[x, y]] }
            : { type: 'rect', color, width: penW, x, y, w: 0, h: 0 };
      });

      canvas.addEventListener('pointermove', (e) => {
        if (!current) return;
        const [x, y] = toCanvas(e);
        if (current.type === 'pen') current.points.push([x, y]);
        else if (current.type === 'rect') {
          current.w = x - current.x;
          current.h = y - current.y;
        }
        draw();
      });

      const endStroke = () => {
        if (!current) return;
        if (current.type === 'pen' && current.points.length === 1) current.points.push(current.points[0]);
        const tiny = current.type === 'rect' && Math.abs(current.w) < 3 && Math.abs(current.h) < 3;
        if (!tiny) shapes.push(current);
        current = null;
        draw();
      };
      canvas.addEventListener('pointerup', endStroke);
      canvas.addEventListener('pointercancel', endStroke);

      toolBtns.forEach((b) =>
        b.addEventListener('click', () => {
          tool = b.dataset.tool as Tool;
          toolBtns.forEach((x) => x.classList.toggle('active', x === b));
        }),
      );
      colorEl.addEventListener('input', () => (color = colorEl.value));

      const undo = () => {
        shapes.pop();
        draw();
      };
      $<HTMLButtonElement>('.undo').addEventListener('click', undo);

      function close(result: EditorResult | null) {
        host.remove();
        resolve(result);
      }

      function exportImage(): string {
        draw();
        const k = Math.min(1, MAX_W / canvas.width);
        const out = document.createElement('canvas');
        out.width = Math.round(canvas.width * k);
        out.height = Math.round(canvas.height * k);
        out.getContext('2d')!.drawImage(canvas, 0, 0, out.width, out.height);
        return out.toDataURL('image/jpeg', 0.85);
      }

      const save = () => close({ note: noteEl.value.trim(), image: exportImage() });
      $<HTMLButtonElement>('.save').addEventListener('click', save);
      $<HTMLButtonElement>('.cancel').addEventListener('click', () => close(null));

      noteEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          save();
        }
      });

      // Aísla teclado de la página y atajos del editor
      host.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') close(null);
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.target === host) undo();
      });
      for (const ev of ['keyup', 'keypress'] as const) host.addEventListener(ev, (e) => e.stopPropagation());

      document.body.appendChild(host);
    }
  });
}
