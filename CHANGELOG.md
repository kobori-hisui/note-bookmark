# Changelog

## [0.2.0] - 2026-11-12

### Agregado
- **Guardar imágenes como nota.** El menú contextual ahora aparece también al hacer clic derecho sobre una imagen (antes solo con texto seleccionado). El ítem pasó a llamarse "Guardar como nota".
- **Varias imágenes a la vez.** Si seleccionas un rango con imágenes y haces clic derecho, se adjuntan todas las que están completamente dentro de la selección (máx. 30). También funciona con `Alt+C` si hay una selección con imágenes.
- **Miniaturas en el cuadro de nota** con botón ✕ para quitar las que no quieras, indicador de descarga ("Descargando N…") y contador ("N imágenes"). Se puede guardar con solo imágenes, sin texto ni cita.
- **Descarga desde el background** (`fetch-image`): usa `host_permissions`, así evita CORS. Soporta URLs `http(s)`, `data:` y `blob:`.
- **Reducción automática:** las imágenes se guardan como JPEG de máx. 1600 px de ancho (calidad 0.85, fondo blanco para transparencias) para no inflar el storage.
- **Galería en el historial:** las notas muestran una cuadrícula con sus imágenes.
- **Visor de imágenes dentro del popup:** al hacer clic en una imagen se abre en grande, con navegación ‹ › / ← →, contador, y cierre con Esc, ✕ o clic fuera. También se usa para la captura de región.
- **Alt+S:** la lista de notas de la página indica cuántas imágenes tiene cada nota (🖼 N).
- **Exportar a SQLite:** nueva tabla `bookmark_images (bookmark_id, position, image BLOB, image_mime)`; `PRAGMA user_version` sube a 2.

### Agregado (ubicar la nota en la página)
- **Ubicación propia, sin depender de Chrome.** Al abrir una nota desde el historial, la pestaña se desplaza hasta el texto o la imagen guardados y los marca con un recuadro amarillo/rojo y un aviso. El texto se busca en el DOM ignorando espacios y bloques (funciona con etiquetas `inline-block`/`flex`, como en nhentai.net); si se repite, elige la aparición más cercana a la posición guardada; las imágenes se encuentran por su URL original (incluye `data-src`/`srcset`); si no aparece nada, deja en la zona aproximada donde se guardó. Reintenta ~12 s por si la página carga contenido después.
- **Alt+S:** hacer clic en una nota de la lista lleva a su lugar en la página actual.
- Campos nuevos opcionales en la nota: `imageSrcs` (URL original de cada imagen) y `anchor` (posición en la página). `fragment` queda como respaldo para Ctrl/Shift/clic central sobre el enlace.
- Archivo nuevo: `locate.ts` (junto al content script).

### Corregido (imágenes al ubicar la nota)
- Las imágenes ahora se encuentran aunque el sitio cambie de subdominio de CDN (t1/t3/t5…), de formato (`.jpg` / `.jpg.webp`) o de parámetros entre cargas: se comparan por varias claves (host+ruta, ruta, carpeta/archivo sin extensión).
- Si la imagen aún no tiene tamaño (carga perezosa), el marcador usa su contenedor visible; y la vista se reajusta tras unos segundos si el layout se movió.

### Cambiado
- **Enlace a la cita (text fragment):** ahora el fragmento se calcula al seleccionar, partiendo el texto por bloques de la página, y se guarda en el nuevo campo opcional `fragment`. Usa la forma `inicio,fin`, así la cita se resalta aunque cruce varios bloques (etiquetas `inline-block`/`flex`, como en nhentai.net). Las notas viejas siguen usando el método anterior.
- Modelo `Bookmark`: nuevo campo opcional `images?: string[] | null`. Las notas anteriores siguen funcionando sin migración.
- Fusionar notas ahora junta también las imágenes de todas las partes.
- Importar JSON valida y conserva `images` (solo `data:image/...`).
- La validación de "nota vacía" al editar considera las imágenes.
- El botón "Región" conserva las imágenes ya adjuntas al guardar.

### Corregido
- Al seleccionar 3 imágenes se adjuntaban 4 (se colaba la imagen vecina que solo rozaba el borde de la selección). Ahora solo se toman las completamente contenidas; la imagen donde se hace clic derecho siempre se incluye.

### Limitaciones conocidas
- Sitios con protección anti-hotlink (revisan el Referer) pueden responder 403: esas imágenes no se descargan y se avisa con "N sin descargar".
- Las imágenes SVG no se pueden convertir y se omiten.
- Las imágenes dentro de Shadow DOM no se detectan en la selección múltiple (el clic derecho directo sí funciona).

### Archivos modificados
`background.ts`, `index.ts` (content script), `bookmarks.ts`, `backup.ts`, `sqlite.ts`, `main.ts`, `style.css`, `quote.ts`, `locate.ts` (nuevo, en el content script)
**Nuevo:** `utils/image.ts`