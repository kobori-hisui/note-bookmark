# Note Bookmarks

Extensión de Chrome (WXT + React + TypeScript) para guardar notas por sitio, con cita, imágenes y capturas anotadas, y administrarlas desde un panel.

## Uso rápido

| Atajo | Acción |
| --- | --- |
| `Alt+C` | Abrir el cuadro de nota (con la selección como cita) |
| `Alt+S` | Ver las notas de la página actual |
| Clic derecho → «Guardar como nota» | Nota desde un texto o una imagen |
| `Tab` o 📁 | Elegir o crear carpeta |
| `/carpeta texto` | Guardar esa nota en «carpeta» (con sugerencias al escribir) |
| `/"mi tesis" texto` | Carpeta con espacios |

El popup es el acceso rápido; el **panel** (`/dashboard.html`) es para administrar todo.

## Estructura

```
entrypoints/
  background.ts        menú contextual, atajos, captura, descarga de imágenes
  content/             cuadro de nota, editor de capturas, ubicar la nota en la página
  popup/               historial rápido
  dashboard/           panel de administración (React)
    pages/             una página por sección (Notas, Carpetas, Estadísticas, Datos, Ajustes)
    components/        ui/ (base), layout/, notes/, stats/
    lib/               lógica de datos sin React (filtros, acciones, stats, importar/exportar)
    store/             estado compartido (notas, filtros, selección, avisos, confirmaciones)
    routes.tsx         lista de secciones: el sidebar y el router salen de aquí
utils/
  bookmarks.ts         modelo Bookmark y operaciones sobre el storage
  folders.ts           carpetas automáticas (3+ notas de un mismo sitio) y manuales
  backup.ts            exportar / importar JSON
  sqlite.ts            exportar a .db
  settings.ts          ajustes (modo de imágenes, carpeta activa)
  image.ts, quote.ts   imágenes JPEG y enlaces a la cita
```

Las carpetas **no se guardan**: se calculan al mostrar. Las manuales (campo `folder` de la nota) mandan sobre las automáticas.

## Panel de administración

- **Notas:** tabla o cuadrícula, búsqueda (`/`), filtros, selección múltiple y acciones en lote con Deshacer.
- **Carpetas:** renombrar, fusionar y quitar.
- **Estadísticas, Datos (JSON / .db) y Ajustes.**

### Agregar una sección

1. Crea `entrypoints/dashboard/pages/MiPagina.tsx`.
2. Añade una línea en `entrypoints/dashboard/routes.tsx`.

El sidebar y el router la toman solos. Un filtro nuevo va en `lib/search.ts` y su control en `NotesToolbar`; una acción con «Deshacer» en `lib/useActions.ts`.

## Desarrollo

```
pnpm install
pnpm add react react-dom
pnpm add -D @types/react @types/react-dom @wxt-dev/module-react
pnpm wxt prepare   # regenera los tipos (necesario tras agregar entrypoints)
pnpm dev
```

Configuración necesaria:

- `wxt.config.ts`: `modules: ['@wxt-dev/module-react']` **fuera** de `manifest` (dentro, Chrome avisa «Unrecognized manifest key»).
- `tsconfig.json`: `"compilerOptions": { "jsx": "react-jsx" }`.
- Para abrir el panel: `browser.runtime.getURL('/dashboard.html')` (con `/` al inicio).

## Notas técnicas

- Todo vive en `storage.local` (con `unlimitedStorage`): privado y sin servidor.
- Imágenes: «solo enlace» (por defecto, casi sin espacio) o «offline» (~150–400 KB cada una).
- Con decenas de miles de notas conviene migrar a IndexedDB.

Ver [CHANGELOG.md](./CHANGELOG.md) para el historial de cambios.