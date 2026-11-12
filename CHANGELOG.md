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

### Cambiado
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
`background.ts`, `index.ts` (content script), `bookmarks.ts`, `backup.ts`, `sqlite.ts`, `main.ts`, `style.css`
**Nuevo:** `utils/image.ts`
