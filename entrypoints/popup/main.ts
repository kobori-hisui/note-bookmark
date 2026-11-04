import { bookmarksItem, removeBookmark, type Bookmark } from '@/utils/bookmarks';

const list = document.getElementById('list') as HTMLUListElement;
const empty = document.getElementById('empty') as HTMLParagraphElement;

function render(items: Bookmark[]) {
  list.replaceChildren();
  empty.hidden = items.length > 0;

  for (const b of items) {
    const li = document.createElement('li');

    if (b.image) {
      const img = document.createElement('img');
      img.src = b.image;
      li.append(img);
    }

    const note = document.createElement('div');
    note.className = 'note';
    note.textContent = b.note;

    const meta = document.createElement('div');
    meta.className = 'meta';

    const a = document.createElement('a');
    a.href = b.url;
    a.target = '_blank';
    a.textContent = b.url;
    a.title = b.url;

    const date = document.createElement('span');
    date.textContent = new Date(b.date).toLocaleString('es-PE');

    const del = document.createElement('button');
    del.textContent = 'Borrar';
    del.onclick = () => removeBookmark(b.id);

    meta.append(a, date, del);
    li.append(note, meta);
    list.append(li);
  }
}

bookmarksItem.getValue().then(render);
bookmarksItem.watch((v) => render(v ?? []));
