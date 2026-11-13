import { useRoute } from '../../lib/router';
import { routes } from '../../routes';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function Shell() {
  const path = useRoute();
  const route = routes.find((r) => r.path === path) ?? routes[0];
  const Page = route.component;

  return (
    <div className="shell">
      <Sidebar current={route.path} />
      <div className="main">
        <Topbar current={route.path} />
        <main className="content">
          <Page />
        </main>
      </div>
    </div>
  );
}
