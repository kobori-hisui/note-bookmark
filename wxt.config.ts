import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Note Bookmarks',
    description: 'Guarda notas por sitio con fecha y URL',
    permissions: ['storage'],
    commands: {
      'toggle-note': {
        suggested_key: { default: 'Alt+C' },
        description: 'Mostrar/ocultar campo de nota',
      },
    },
  },
});
