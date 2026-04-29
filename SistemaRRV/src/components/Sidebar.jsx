export const NAV = [
  { id: 'inicio', label: 'Inicio', d: 'M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z' },
  { id: 'dashboard', label: 'Dashboard', d: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z' },
  { id: 'mapa', label: 'Mapa por ciudad', d: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z M9 3v15 M15 6v15' },
  { id: 'actas', label: 'Actas recibidas', d: 'M5 3h11l4 4v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M16 3v4h4 M8 13h8 M8 17h8 M8 9h3' },
  { id: 'dept', label: 'Detalle dept.', d: 'M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14 2 9.27l6.91-1.01z' },
  { id: 'pipeline', label: 'Como funciona', d: 'M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83' },
  { id: 'transp', label: 'Transparencia', d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
]

function SvgIco({ d }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

export default function Sidebar({ activeView }) {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <div className="brand-mark">R</div>
        <div className="brand-text">
          <strong>RRV Bolivia</strong>
          <span>Recuento rapido</span>
        </div>
      </div>

      <nav className="sidebar__menu" aria-label="Navegacion principal">
        {NAV.map(n => (
          <a key={n.id} href={`#${n.id}`} className={activeView === n.id ? 'active' : ''}>
            <span className="ico"><SvgIco d={n.d} /></span>
            <span>{n.label}</span>
          </a>
        ))}
      </nav>

      <div style={{ flex: 1 }} />

      <div className="sidebar__status">
        <h4>Estado del sistema</h4>
        <div className="status-row"><span className="status-dot" /><span>Nodo RRV activo</span></div>
        <div className="status-row"><span className="status-dot" /><span>Replica oficial sincronizada</span></div>
        <div className="status-row"><span className="status-dot warn" /><span>Cola SMS con revision</span></div>
        <div style={{
          marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)',
          fontFamily: 'var(--font-mono)', fontSize: '10.5px',
          color: 'var(--text-faint)', letterSpacing: '0.08em',
        }}>
          v1.4.2 - BUILD 2026-04-26
        </div>
      </div>
    </aside>
  )
}
