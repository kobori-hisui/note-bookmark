import { bookmarksItem, removeBookmark, type Bookmark } from '@/utils/bookmarks';
import { folderLabel, groupBookmarks, type Folder } from '@/utils/folders';

const list = document.getElementById('list') as HTMLUListElement;
const empty = document.getElementById('empty') as HTMLParagraphElement;

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

  const note = document.createElement('div');
  note.className = 'note';
  note.textContent = b.note;

  const meta = document.createElement('div');
  meta.className = 'meta';

  // La carpeta solo muestra la ruta parcial; aquí siempre va la URL completa
  const a = document.createElement('a');
  a.href = b.url;
  a.target = '_blank';
  a.textContent = b.url;
  a.title = b.url;

  const date = document.createElement('span');
  const d = new Date(b.date);
  date.textContent = isNaN(d.getTime()) ? '' : d.toLocaleString('es-PE');

  const del = document.createElement('button');
  del.textContent = 'Borrar';
  del.onclick = () => removeBookmark(b.id);

  meta.append(a, date, del);
  card.append(note, meta);
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

bookmarksItem.getValue().then(render);
bookmarksItem.watch((v) => render(v ?? []));
