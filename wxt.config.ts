import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],   // ← aquí, fuera de manifest
  manifest: {
    name: 'Note Bookmarks',
    description: 'Guarda notas por sitio con fecha, URL e imagen anotada',
    permissions: ['storage', 'unlimitedStorage', 'contextMenus'],
    host_permissions: ['<all_urls>'],
    commands: {
      'toggle-note': {
        suggested_key: { default: 'Alt+C' },
        description: 'Mostrar/ocultar campo de nota',
      },
      'show-notes': {
        suggested_key: { default: 'Alt+S' },
        description: 'Ver las notas guardadas de esta página',
      },
    },
  },
});