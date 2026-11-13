import { Shell } from './components/layout/Shell';
import { BookmarksProvider } from './store/bookmarks';
import { ConfirmProvider } from './store/confirm';
import { FiltersProvider } from './store/filters';
import { SelectionProvider } from './store/selection';
import { ToastProvider } from './store/toast';

/** Orden importa: Selection necesita Bookmarks; Confirm usa componentes de UI. */
export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <BookmarksProvider>
          <FiltersProvider>
            <SelectionProvider>
              <Shell />
            </SelectionProvider>
          </FiltersProvider>
        </BookmarksProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
