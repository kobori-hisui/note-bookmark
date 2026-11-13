/** Gráficos sin dependencias (CSS puro). Para algo más complejo, cambia solo este archivo. */

export function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

/** Barras verticales (serie temporal). */
export function BarChart({ data }: { data: { label: string; n: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  return (
    <div className="bars" role="img" aria-label="Notas por día">
      {data.map((d, i) => (
        <div key={i} className="bar-col" title={`${d.label}: ${d.n}`}>
          <div className="bar" style={{ height: `${(d.n / max) * 100}%` }} />
        </div>
      ))}
    </div>
  );
}

/** Ranking horizontal (top sitios, top carpetas). */
export function RankList({ rows }: { rows: { name: string; n: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (!rows.length) return <div className="muted">Sin datos todavía.</div>;
  return (
    <div className="rank">
      {rows.map((r) => (
        <div key={r.name} className="rank-row">
          <span className="rank-name" title={r.name}>
            {r.name}
          </span>
          <span className="rank-track">
            <span className="rank-fill" style={{ width: `${(r.n / max) * 100}%` }} />
          </span>
          <span className="rank-n">{r.n}</span>
        </div>
      ))}
    </div>
  );
}
