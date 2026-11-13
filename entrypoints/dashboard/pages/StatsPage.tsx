import { useMemo } from 'react';
import { BarChart, Kpi, RankList } from '../components/stats/Charts';
import { PageHeader } from '../components/layout/PageHeader';
import { mb } from '../lib/format';
import { computeStats } from '../lib/stats';
import { useBookmarks } from '../store/bookmarks';

export function StatsPage() {
  const { items, folders } = useBookmarks();
  const s = useMemo(() => computeStats(items, folders), [items, folders]);
  const last30 = s.perDay.reduce((n, d) => n + d.n, 0);

  return (
    <>
      <PageHeader title="Estadísticas" subtitle="Un vistazo a lo que has guardado" />

      <div className="kpis">
        <Kpi label="Notas" value={s.total} sub={`${last30} en los últimos 30 días`} />
        <Kpi label="Carpetas" value={s.folders} />
        <Kpi label="Sitios" value={s.sites} />
        <Kpi label="Con imágenes" value={s.withImage} sub={`${s.images} imágenes en total`} />
        <Kpi label="Espacio (imágenes)" value={mb(s.bytes)} />
      </div>

      <section className="panel">
        <h2 className="panel-title">Notas por día · últimos 30 días</h2>
        <BarChart data={s.perDay.map((d) => ({ label: d.day, n: d.n }))} />
        <div className="bars-axis">
          <span>{s.perDay[0]?.day}</span>
          <span>{s.perDay[s.perDay.length - 1]?.day}</span>
        </div>
      </section>

      <div className="two-col">
        <section className="panel">
          <h2 className="panel-title">Sitios con más notas</h2>
          <RankList rows={s.topSites} />
        </section>
        <section className="panel">
          <h2 className="panel-title">Carpetas más grandes</h2>
          <RankList rows={s.topFolders} />
        </section>
      </div>
    </>
  );
}
