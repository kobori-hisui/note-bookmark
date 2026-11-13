import type { ComponentType } from 'react';
import type { IconName } from './components/ui';
import { DataPage } from './pages/DataPage';
import { FoldersPage } from './pages/FoldersPage';
import { NotesPage } from './pages/NotesPage';
import { SettingsPage } from './pages/SettingsPage';
import { StatsPage } from './pages/StatsPage';

export interface RouteDef {
  path: string;
  label: string;
  icon: IconName;
  component: ComponentType;
}

/**
 * Para agregar una sección al panel: crea pages/MiPagina.tsx y añade UNA línea aquí.
 * El sidebar y el router la toman solos. La primera es la página por defecto.
 */
export const routes: RouteDef[] = [
  { path: '/notes', label: 'Notas', icon: 'notes', component: NotesPage },
  { path: '/folders', label: 'Carpetas', icon: 'folder', component: FoldersPage },
  { path: '/stats', label: 'Estadísticas', icon: 'chart', component: StatsPage },
  { path: '/data', label: 'Datos', icon: 'data', component: DataPage },
  { path: '/settings', label: 'Ajustes', icon: 'sliders', component: SettingsPage },
];
