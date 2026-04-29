import { useMemo, useState } from 'react'
import MapBlock from '../components/MapBlock'
import ActasStream from '../components/ActasStream'
import {
  actas,
  auditEvents,
  comparison,
  departments,
  fmt,
  kpis,
  national,
  parties,
  partyById,
  estadoColores,
  techMetrics,
} from '../data/rrv'

function MiniMetric({ label, value, note }) {
  return (
    <div className="mini-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  )
}

function DiffTable() {
  return (
    <div className="data-table">
      <div className="data-table__head data-table__row--compare">
        <span>Partido</span>
        <span>RRV</span>
        <span>Oficial</span>
        <span>Diff</span>
      </div>
      {comparison.map(row => (
        <div key={row.id} className="data-table__row data-table__row--compare">
          <span className="row-party"><i style={{ background: row.color }} />{row.name}</span>
          <span>{row.rrvPct.toFixed(2)}%</span>
          <span>{row.officialPct.toFixed(2)}%</span>
          <span className={Math.abs(row.diffPp) > 0.1 ? 'warn-text' : ''}>{row.diffPp > 0 ? '+' : ''}{row.diffPp.toFixed(2)} pp</span>
        </div>
      ))}
    </div>
  )
}

export function InicioPage() {
  const actasPct = (kpis.actasRecibidas / kpis.actasTotal) * 100
  return (
    <div className="page-stack">
      <section className="overview-band">
        <div>
          <p className="eyebrow">Arquitectura distribuida</p>
          <h2>Dos pipelines desacoplados para resultados preliminares y computo oficial.</h2>
          <p>
            La practica exige RRV de baja latencia, computo oficial auditable y un dashboard que compare ambos flujos.
            Esta implementacion ahora expone las secciones clave en vez de dejar el sidebar como decoracion.
          </p>
        </div>
        <div className="overview-band__stats">
          <MiniMetric label="Recintos" value="5.368" note="con conectividad mixta" />
          <MiniMetric label="Mesas" value="35.000" note="universo esperado" />
          <MiniMetric label="Actas RRV" value={`${actasPct.toFixed(1)}%`} note="publicadas o en proceso" />
        </div>
      </section>

      <section className="page-grid page-grid--3">
        <div className="card">
          <div className="card-title">Pipeline <em>RRV</em></div>
          <p className="card-copy">Foto/SMS, OCR, validacion basica, idempotencia y lectura optimizada para publicacion temprana.</p>
        </div>
        <div className="card">
          <div className="card-title">Computo <em>oficial</em></div>
          <p className="card-copy">CSV transcrito, validacion fuerte, auditoria por eventos y persistencia orientada a trazabilidad.</p>
        </div>
        <div className="card">
          <div className="card-title">Comparacion <em>analitica</em></div>
          <p className="card-copy">Diferencias por partido, actas inconsistentes, latencia, throughput y cobertura territorial.</p>
        </div>
      </section>

      <section className="card">
        <div className="card-title">RRV vs <em>Oficial</em></div>
        <div className="card-sub">Diferencia preliminar calculada sobre el dataset de demostracion</div>
        <DiffTable />
      </section>
    </div>
  )
}

export function MapaPage() {
  const [visualMode, setVisualMode] = useState('leader')
  const [partyFilter, setPartyFilter] = useState('all')
  const [selectedDept, setSelectedDept] = useState(departments[0])
  const [mapZoom, setMapZoom] = useState(1)

  const ranking = useMemo(() => {
    const valueFor = d => {
      if (partyFilter !== 'all') return d.pct[partyFilter]
      if (visualMode === 'participacion') return d.participacion
      if (visualMode === 'actas') return (d.actas / d.mesas) * 100
      return d.pct[d.leader]
    }
    return [...departments].sort((a, b) => valueFor(b) - valueFor(a)).map(d => ({ ...d, value: valueFor(d) }))
  }, [visualMode, partyFilter])

  const selectedLeader = partyById(selectedDept.leader)
  const selectedParty = partyFilter === 'all' ? selectedLeader : partyById(partyFilter)
  const actasPct = (selectedDept.actas / selectedDept.mesas) * 100
  const detailHref = `#dept?id=${encodeURIComponent(selectedDept.id)}`

  return (
    <div className="map-page">
      <section className="map-filterbar">
        <div className="filter-group">
          <span>VISUALIZAR POR</span>
          <div className="chips">
            {[
              ['leader', 'Lider'],
              ['margin', 'Margen'],
              ['participacion', 'Participacion'],
              ['actas', 'Actas (%)'],
            ].map(option => (
              <button
                key={option[0]}
                type="button"
                className={`chip${visualMode === option[0] ? ' active' : ''}`}
                onClick={() => setVisualMode(option[0])}
              >
                {option[1]}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-group">
          <span>PARTIDO</span>
          <div className="chips">
            <button
              type="button"
              className={`chip${partyFilter === 'all' ? ' active' : ''}`}
              onClick={() => setPartyFilter('all')}
            >
              Todos
            </button>
            {parties.map(p => (
              <button
                key={p.id}
                type="button"
                className={`chip party-chip${partyFilter === p.id ? ' active' : ''}`}
                onClick={() => setPartyFilter(p.id)}
              >
                <i style={{ background: p.color }} />
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="map-main-layout">
        <div className="map-board card">
          <div className="map-board__head">
            <div>
              <div className="card-title">Bolivia <em>en vivo</em></div>
              <div className="card-sub">Click en un departamento para ver el detalle</div>
            </div>
            <div className="map-tools">
              <button type="button" onClick={() => setMapZoom(z => Math.min(1.28, +(z + 0.08).toFixed(2)))}>+</button>
              <button type="button" onClick={() => setMapZoom(z => Math.max(0.86, +(z - 0.08).toFixed(2)))}>-</button>
              <button type="button" onClick={() => setMapZoom(1)}>↻</button>
            </div>
          </div>

          <div className="map-canvas-card">
            <MapBlock
              mode={visualMode}
              partyFilter={partyFilter}
              selectedDeptId={selectedDept.id}
              onSelectDept={setSelectedDept}
              showLegend={false}
              zoom={mapZoom}
            />
            <div className="map-legend-pill">
              {parties.map(p => (
                <span key={p.id}><i style={{ background: p.color }} />{p.name}</span>
              ))}
            </div>
          </div>
        </div>

        <aside className="map-inspector card">
          <div
            key={selectedDept.id}
            className="map-inspector__top"
            style={{ '--winner-color': selectedParty.color }}
          >
            <div className="eyebrow">{selectedDept.id} capital - {selectedDept.capital}</div>
            <h3>{selectedDept.name}</h3>
            <div className="winner-pill">
              <span><i style={{ background: selectedParty.color }} />{partyFilter === 'all' ? selectedLeader.name : selectedParty.name}</span>
              <strong style={{ color: selectedParty.color }}>
                {selectedDept.pct[partyFilter === 'all' ? selectedDept.leader : partyFilter].toFixed(1)}%
              </strong>
            </div>
          </div>

          <div className="map-inspector__metrics">
            <div>
              <label>Votos preliminares</label>
              <strong>{fmt.n(selectedDept.votos)}</strong>
              <span>contabilizados</span>
            </div>
            <div>
              <label>Margen del lider</label>
              <strong className="accent-number">+{(selectedDept.pct[selectedDept.leader] - 24.7).toFixed(1)}<small> pp</small></strong>
              <span>vs. 2do lugar</span>
            </div>
            <div>
              <label>Mesas</label>
              <strong>{fmt.n(selectedDept.mesas)}</strong>
              <span>en padron</span>
            </div>
            <div>
              <label>Participacion</label>
              <strong>{selectedDept.participacion.toFixed(1)}<small>%</small></strong>
              <span>turnout estimado</span>
            </div>
          </div>

          <div className="map-inspector__section">
            <div className="eyebrow">Distribucion por partido</div>
            <div className="party-distribution">
              {parties.map(p => (
                <div className="party-dist-row" key={p.id}>
                  <div>
                    <span><i style={{ background: p.color }} />{p.name}</span>
                    <strong style={{ color: p.color }}>{selectedDept.pct[p.id].toFixed(1)}%</strong>
                  </div>
                  <div className="dist-track"><i style={{ width: `${selectedDept.pct[p.id] * 2.1}%`, background: p.color }} /></div>
                </div>
              ))}
            </div>
          </div>

          <div className="map-inspector__section map-inspector__bottom">
            <div>
              <div className="eyebrow">Actas procesadas</div>
              <strong className="accent-number">{actasPct.toFixed(1)}%</strong>
            </div>
            <span>{fmt.n(selectedDept.actas)} / {fmt.n(selectedDept.mesas)}</span>
            <div className="dist-track"><i style={{ width: `${actasPct}%`, background: 'linear-gradient(90deg, var(--accent-blue), var(--accent))' }} /></div>
          </div>

          <div className="map-inspector__actions">
            <a className="btn btn--accent" href={detailHref}>Deep dive →</a>
            <a className="btn" href="#actas">Ver actas</a>
          </div>
        </aside>
      </section>

      <section className="departments-strip card">
        <div className="departments-strip__head">
          <div>
            <div className="card-title">Los <em>9 departamentos</em></div>
            <div className="card-sub">Comparacion rapida - click para enfocar</div>
          </div>
          <span>% DEL LIDER</span>
        </div>
        <div className="dept-mini-grid">
          {departments.map(d => {
            const lead = partyById(d.leader)
            return (
              <button
                type="button"
                className={`dept-mini${selectedDept.id === d.id ? ' active' : ''}`}
                key={d.id}
                onClick={() => setSelectedDept(d)}
              >
                <strong>{d.name}</strong>
                <span className="dept-dots">
                  {parties.map(p => <i key={p.id} style={{ background: p.color }} />)}
                </span>
                <b style={{ color: lead.color }}>{Math.round(d.pct[d.leader])}%</b>
                <span className="dept-mini-track"><i style={{ width: `${d.pct[d.leader] * 2.1}%`, background: lead.color }} /></span>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

export function ActasPage() {
  const [metricFilter, setMetricFilter] = useState('todas')
  const [originFilter, setOriginFilter] = useState('todos')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [query, setQuery] = useState('')
  const [selectedActa, setSelectedActa] = useState(null)

  const metrics = [
    { id: 'todas', label: 'Todas', value: actas.length, note: '100.0% del total', color: '#94A3B8' },
    { id: 'Publicada', label: 'Publicadas', value: actas.filter(a => a.estado === 'Publicada').length, note: `${((actas.filter(a => a.estado === 'Publicada').length / actas.length) * 100).toFixed(1)}% del total`, color: '#16A34A' },
    { id: 'Validada', label: 'Validadas', value: actas.filter(a => a.estado === 'Validada').length, note: `${((actas.filter(a => a.estado === 'Validada').length / actas.length) * 100).toFixed(1)}% del total`, color: '#2563EB' },
    { id: 'En revision', label: 'En revision', value: actas.filter(a => a.estado === 'En revision').length, note: `${((actas.filter(a => a.estado === 'En revision').length / actas.length) * 100).toFixed(1)}% del total`, color: '#D97706' },
    { id: 'Duplicada', label: 'Duplicadas', value: actas.filter(a => a.estado === 'Duplicada').length, note: `${((actas.filter(a => a.estado === 'Duplicada').length / actas.length) * 100).toFixed(1)}% del total`, color: '#DC2626' },
  ]

  const filteredActas = actas.filter(a => {
    const q = query.trim().toLowerCase()
    const matchesMetric = metricFilter === 'todas' || a.estado === metricFilter || a.origen === metricFilter
    const matchesOrigin = originFilter === 'todos' || a.origen === originFilter
    const matchesStatus = statusFilter === 'todos' || a.estado === statusFilter
    const matchesQuery = !q || [a.id, a.ciudad, a.recinto, a.mesa, a.origen, a.estado].join(' ').toLowerCase().includes(q)
    return matchesMetric && matchesOrigin && matchesStatus && matchesQuery
  })

  const exportCsv = () => {
    const header = ['id', 'ciudad', 'recinto', 'mesa', 'origen', 'estado', 'confianza', 'hora']
    const rows = filteredActas.map(a => [a.id, a.ciudad, a.recinto, a.mesa, a.origen, a.estado, a.conf ?? '', a.hora])
    const csv = [header, ...rows].map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'actas-rrv.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="actas-page">
      <section className="acta-metrics">
        {metrics.map(m => (
          <button
            key={m.id}
            type="button"
            className={`acta-metric${metricFilter === m.id ? ' active' : ''}`}
            style={{ '--metric-color': m.color }}
            onClick={() => setMetricFilter(m.id)}
          >
            <span>{m.label}</span>
            <strong>{fmt.n(m.value)}</strong>
            <small>{m.note}</small>
          </button>
        ))}
      </section>

      <section className="card actas-console">
        <div className="actas-filters">
          <label className="search-box">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar por ID, recinto, mesa, ciudad..."
            />
          </label>
          <div className="origin-filter">
            <span>ORIGEN</span>
            <div className="chips">
              {['todos', 'Foto/OCR', 'SMS'].map(origin => (
                <button
                  key={origin}
                  type="button"
                  className={`chip${originFilter === origin ? ' active' : ''}`}
                  onClick={() => setOriginFilter(origin)}
                >
                  {origin === 'todos' ? 'Todos' : origin}
                </button>
              ))}
            </div>
          </div>
          <label className="status-select">
            <span>Estado</span>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="todos">Todos</option>
              {Object.keys(estadoColores).map(s => <option value={s} key={s}>{s}</option>)}
            </select>
          </label>
          <button className="btn" type="button" onClick={exportCsv}>↓ Exportar CSV</button>
        </div>

        <div className="actas-table">
          <div className="actas-table__head">
            <span>ID</span>
            <span>Ciudad</span>
            <span>Recinto</span>
            <span>Mesa</span>
            <span>Origen</span>
            <span>Estado</span>
            <span>Confianza</span>
            <span>Hora</span>
          </div>
          {filteredActas.map(a => {
            const colors = estadoColores[a.estado]
            return (
              <button type="button" className="actas-table__row" key={a.id} onClick={() => setSelectedActa(a)}>
                <span className="mono-line">{a.id}</span>
                <span>{a.ciudad}</span>
                <span className="acta-place">
                  <strong>{a.recinto}</strong>
                </span>
                <span>{a.mesa}</span>
                <span className="origen-pill">
                  <OriginIcon origin={a.origen} />
                  {a.origen}
                </span>
                <span className="estado-pill" style={{ background: colors.bg, color: colors.fg }}>{a.estado}</span>
                <span className="confidence-cell">
                  {a.conf != null ? (
                    <>
                      <b>{a.conf.toFixed(1)}%</b>
                      <i><em style={{ width: `${a.conf}%`, background: colors.fg }} /></i>
                    </>
                  ) : '-'}
                </span>
                <span className="mono-line">{a.hora}</span>
              </button>
            )
          })}
        </div>
        <div className="actas-table__foot">
          <span>{filteredActas.length} actas mostradas - {actas.length} totales</span>
          <span>Stream en vivo - auto-refresh cada 3s</span>
        </div>
      </section>

      {selectedActa && (
        <ActaModal acta={selectedActa} onClose={() => setSelectedActa(null)} />
      )}
    </div>
  )
}

function OriginIcon({ origin }) {
  if (origin === 'SMS') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H10l-4 4v-4.2A2.5 2.5 0 0 1 5 12.5z" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8.5h3l1.2-2h7.6l1.2 2h3v9H4z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  )
}

function ActaModal({ acta, onClose }) {
  const colors = estadoColores[acta.estado]
  const steps = [
    ['Recepcion', acta.origen === 'SMS' ? 'Mensaje recibido por gateway' : 'Foto recibida desde recinto'],
    ['Extraccion', acta.origen === 'SMS' ? 'Parser SMS interpreta votos' : 'OCR extrae campos del acta'],
    ['Validacion', 'Estructura, firma, duplicados y consistencia basica'],
    ['Publicacion', acta.estado === 'Publicada' ? 'Disponible en dashboard publico' : 'Pendiente de cierre operativo'],
  ]

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="acta-modal" role="dialog" aria-modal="true" aria-label={`Detalle ${acta.id}`} onClick={e => e.stopPropagation()}>
        <div className="acta-modal__grid">
          <div className="acta-modal__main">
            <button className="modal-close" type="button" onClick={onClose}>×</button>
            <div className="acta-modal__head">
              <div>
                <div className="eyebrow">Acta - detalle</div>
                <h3>{acta.id}</h3>
              </div>
            </div>
            <div className="acta-detail-list">
              {[
                ['Ciudad', acta.ciudad],
                ['Recinto', acta.recinto],
                ['Mesa', acta.mesa],
                ['Origen', acta.origen],
                ['Estado', <span className="estado-pill" style={{ background: colors.bg, color: colors.fg }}>{acta.estado}</span>],
                ['Confianza OCR', acta.conf != null ? `${acta.conf.toFixed(1)}%` : '-'],
                ['Hash del acta', `sha256:${acta.id.replace('A-', '')}...d4f8b21a`],
              ].map(row => (
                <div key={row[0]}>
                  <span>{row[0]}</span>
                  <strong>{row[1]}</strong>
                </div>
              ))}
            </div>

            <div className="acta-photo">
              <div className="acta-paper">
                <div className="acta-paper__top">
                  <h4>ACTA ELECTORAL</h4>
                  <span>{acta.id} - {acta.mesa}</span>
                </div>
                <div className="acta-paper__meta">
                  <span>Recinto:</span><b>{acta.recinto}</b>
                  <span>Localidad:</span><b>{acta.ciudad}, Bolivia</b>
                  <span>Hora cierre:</span><b>{acta.hora}</b>
                </div>
                <div className="acta-paper__rows">
                  {parties.map((p, i) => (
                    <div key={p.id}>
                      <i style={{ background: p.color }} />
                      <span>{p.name}</span>
                      <b>{[110, 87, 71, 46][i]}</b>
                      <small>{[35.0, 27.7, 22.6, 14.6][i].toFixed(1)}%</small>
                    </div>
                  ))}
                  <div><i /><span>Blancos</span><b>4</b><small /></div>
                  <div><i /><span>Nulos</span><b>2</b><small /></div>
                </div>
                <div className="acta-paper__total"><span>Total validos</span><b>314</b></div>
                <div className="acta-signatures">
                  <span>Presidente/a</span>
                  <span>Secretario/a</span>
                  <span>Vocal</span>
                </div>
              </div>
            </div>
          </div>

          <aside className="acta-info">
            <span className="estado-pill modal-status" style={{ background: colors.bg, color: colors.fg }}>{acta.estado}</span>
            <div className="acta-pipeline">
              <div className="eyebrow">Pipeline</div>
              <h4>Procesamiento <em>paso a paso</em></h4>
              {steps.map((step, index) => (
                <div className="acta-step" key={step[0]}>
                  <b>{index + 1}</b>
                  <div>
                    <strong>{step[0]}</strong>
                    <span>{step[1]}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <div className="eyebrow">Acciones</div>
              <button type="button" className="btn">Ver imagen original</button>
              <button type="button" className="btn">Reproceso manual</button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

export function DeptPage() {
  const rawHash = window.location.hash.replace('#', '')
  const query = rawHash.includes('?') ? rawHash.slice(rawHash.indexOf('?') + 1) : ''
  const params = new URLSearchParams(query)
  const requestedId = params.get('id') || params.get('dept')
  const dept = departments.find(d => d.id === requestedId) || departments[0]
  const lead = partyById(dept.leader)
  const sortedPct = [...parties].sort((a, b) => dept.pct[b.id] - dept.pct[a.id])
  const secondPct = sortedPct[1] ? dept.pct[sortedPct[1].id] : 0
  const margin = dept.pct[dept.leader] - secondPct
  const actasPct = (dept.actas / dept.mesas) * 100
  const citySeeds = {
    'BO-L': ['El Alto', 'La Paz', 'Viacha', 'Mecapaca', 'Achocalla'],
    'BO-S': ['Santa Cruz', 'Montero', 'Warnes', 'Cotoca', 'La Guardia'],
    'BO-C': ['Cochabamba', 'Quillacollo', 'Sacaba', 'Tiquipaya', 'Vinto'],
    'BO-O': ['Oruro', 'Huanuni', 'Caracollo', 'Challapata', 'Poopo'],
    'BO-P': ['Potosi', 'Llallagua', 'Uyuni', 'Villazon', 'Tupiza'],
    'BO-H': ['Sucre', 'Monteagudo', 'Camargo', 'Padilla', 'Tarabuco'],
    'BO-T': ['Tarija', 'Yacuiba', 'Bermejo', 'Villa Montes', 'San Lorenzo'],
    'BO-B': ['Trinidad', 'Riberalta', 'Guayaramerin', 'San Borja', 'Rurrenabaque'],
    'BO-N': ['Cobija', 'Porvenir', 'Puerto Rico', 'Filadelfia', 'Bolpebra'],
  }
  const ciudades = (citySeeds[dept.id] || [dept.capital, dept.name]).map((nombre, i) => {
    const factor = 1.4 - i * 0.18
    const pctOffset = [0.1, 0.4, 0.8, -2.0, -2.3][i] ?? 0
    return {
      nombre,
      actas: Math.max(80, Math.round((dept.actas / 5) * factor)),
      votos: Math.max(12000, Math.round((dept.votos / 5) * factor)),
      pct: +(dept.pct[dept.leader] + pctOffset).toFixed(1),
    }
  })
  const recentActas = actas.filter(a => a.ciudad === dept.name).concat(actas).slice(0, 10)
  const trendValues = [0, 180, 460, 820, 1240, 1740, 2260, 2840, 3510, 4260, 5130, 6020, dept.actas]
  const chartW = 760
  const chartH = 160
  const maxTrend = dept.actas
  const trendPoints = trendValues.map((value, i) => {
    const x = 12 + (i / (trendValues.length - 1)) * (chartW - 24)
    const y = chartH - 20 - (value / maxTrend) * (chartH - 38)
    return [x, y]
  })
  const linePoints = trendPoints.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const areaPoints = `12,${chartH - 20} ${linePoints} ${chartW - 12},${chartH - 20}`
  let donutCursor = 0

  return (
    <div className="dept-page">
      <section className="dept-hero">
        <div className="dept-hero__bg" />
        <div className="dept-hero__inner">
          <div>
            <div className="dept-eyebrow">
              <a href="#mapa">← Volver al mapa</a>
              <span>{dept.id}</span>
              <span>Capital - {dept.capital}</span>
            </div>
            <h2 className="dept-name">{dept.name}</h2>
            <p className="dept-summary">
              {lead.name} lidera con <em>{dept.pct[dept.leader].toFixed(1)}%</em> de los votos preliminares en este departamento.
              <br />
              Margen sobre el segundo lugar: <em>+{margin.toFixed(1)} pp.</em>
            </p>
          </div>

          <div className="dept-mini-svg">
            <MapBlock selectedDeptId={dept.id} showLegend={false} zoom={1.12} />
          </div>
        </div>
      </section>

      <section className="dept-stats">
        <div className="dept-stat">
          <label>Votos preliminares</label>
          <div className="v">{fmt.n(dept.votos)}</div>
          <div className="desc">contabilizados</div>
        </div>
        <div className="dept-stat">
          <label>Actas procesadas</label>
          <div className="v"><em>{actasPct.toFixed(1)}</em><small>%</small></div>
          <div className="desc">{fmt.n(dept.actas)} de {fmt.n(dept.mesas)} mesas</div>
        </div>
        <div className="dept-stat">
          <label>Margen del lider</label>
          <div className="v"><em>+{margin.toFixed(1)}</em><small> pp</small></div>
          <div className="desc">sobre el segundo lugar</div>
        </div>
        <div className="dept-stat">
          <label>Participacion</label>
          <div className="v">{dept.participacion.toFixed(1)}<small>%</small></div>
          <div className="desc">turnout estimado</div>
        </div>
      </section>

      <section className="dept-content">
        <div className="dept-column">
          <div className="dept-card dept-card--distribution">
            <div className="dept-card__head">
              <div>
                <div className="card-title">Distribución <em>de votos</em></div>
                <div className="card-sub">Por partido · {dept.name}</div>
              </div>
              <span className="badge badge--info">PRELIMINAR</span>
            </div>

            <div className="dept-distribution-grid">
              <div className="donut">
                <svg viewBox="0 0 280 280" aria-hidden="true">
                  {parties.map(p => {
                    const value = dept.pct[p.id]
                    const dash = `${value} ${100 - value}`
                    const node = (
                      <circle
                        key={p.id}
                        cx="140"
                        cy="140"
                        r="110"
                        fill="none"
                        stroke={p.color}
                        strokeWidth="40"
                        strokeDasharray={dash}
                        strokeDashoffset={-donutCursor}
                        pathLength="100"
                      />
                    )
                    donutCursor += value
                    return node
                  })}
                </svg>
                <div className="donut-center">
                  <span>Lider</span>
                  <strong style={{ color: lead.color }}>{Math.round(dept.pct[dept.leader])}%</strong>
                  <em>{lead.name}</em>
                </div>
              </div>

              <div className="dept-party-list">
                {sortedPct.map(p => {
                  const pct = dept.pct[p.id]
                  const votos = Math.round(dept.votos * pct / 100)
                  return (
                    <div className="dept-party-row" key={p.id}>
                      <div className="dept-party-row__head">
                        <span><i style={{ background: p.color }} />{p.name}<small>{p.tag}</small></span>
                        <strong style={{ color: p.color }}>{pct.toFixed(1)}%</strong>
                      </div>
                      <div className="dept-party-track"><i style={{ width: `${(pct / dept.pct[dept.leader]) * 100}%`, background: p.color }} /></div>
                      <div className="dept-party-meta">
                        <span>{fmt.n(votos)} votos</span>
                        <span>{p.id === dept.leader ? 'LIDER' : '-'}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="dept-card">
            <div className="dept-card__head">
              <div>
                <div className="card-title">Llegada de actas <em>por hora</em></div>
                <div className="card-sub">Captura · validación · publicación</div>
              </div>
              <span className="eyebrow">{fmt.n(dept.actas)} ACTAS</span>
            </div>
            <div className="trend-chart">
              <svg viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="none" aria-hidden="true">
                <line className="axis" x1="12" y1={chartH - 20} x2={chartW - 12} y2={chartH - 20} />
                <line className="axis" x1="12" y1="16" x2="12" y2={chartH - 20} />
                <polygon className="area" points={areaPoints} />
                <polyline className="line" points={linePoints} />
                {trendPoints.map(([x, y], index) => <circle className="dot" key={index} cx={x} cy={y} r="3" />)}
                {['8h', '10h', '12h', '14h', '16h', '18h', '20h'].map((label, i) => (
                  <text className="axis-label" key={label} x={12 + (i / 6) * (chartW - 24)} y={chartH - 2}>{label}</text>
                ))}
                <text className="axis-label" x="4" y="20">{fmt.n(dept.actas)}</text>
                <text className="axis-label" x="4" y={chartH - 22}>0</text>
              </svg>
            </div>
          </div>
        </div>

        <div className="dept-column">
          <div className="dept-card">
            <div className="card-title">Por <em>ciudad</em></div>
            <div className="card-sub">Top localidades del departamento</div>
            <div className="ciudades-list">
              {ciudades.map((c, i) => (
                <div className="ciudad-row" key={c.nombre}>
                  <span className="ciudad-rank">#{String(i + 1).padStart(2, '0')}</span>
                  <span className="ciudad-name">{c.nombre}<small>{fmt.n(c.actas)} actas · {fmt.n(c.votos)} votos</small></span>
                  <strong className="ciudad-pct">{c.pct.toFixed(1)}%</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="dept-card">
            <div className="card-title">{dept.name} <em>vs.</em> nacional</div>
            <div className="card-sub">Diferencia respecto al promedio nacional</div>
            <div className="compare-bar">
              {parties.map(p => {
                const local = dept.pct[p.id]
                const nat = national.parties.find(x => x.id === p.id)?.pct ?? local
                const delta = local - nat
                const max = Math.max(local, nat)
                return (
                  <div className="compare-bar__row" key={p.id}>
                    <div className="compare-bar__head">
                      <span className="compare-bar__name"><i style={{ background: p.color }} />{p.name}</span>
                      <span className={`compare-bar__delta ${delta >= 0 ? 'pos' : 'neg'}`}>{delta >= 0 ? '+' : ''}{delta.toFixed(1)} pp</span>
                    </div>
                    <div className="compare-bar__bars">
                      <div className="compare-bar__line">
                        <label>{dept.code}</label>
                        <div className="track"><i style={{ width: `${(local / max) * 100}%`, background: p.color }} /></div>
                        <span>{local.toFixed(1)}%</span>
                      </div>
                      <div className="compare-bar__line">
                        <label>NAC</label>
                        <div className="track"><i style={{ width: `${(nat / max) * 100}%`, background: p.color, opacity: 0.42 }} /></div>
                        <span>{nat.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="dept-card">
            <div className="card-title">Actas <em>recientes</em></div>
            <div className="card-sub">Ultimas registradas en {dept.name}</div>
            <div className="recent-actas">
              {recentActas.map(a => {
                const colors = estadoColores[a.estado]
                return (
                  <div className="recent-actas__row" key={a.id}>
                    <span className="id">{a.id}</span>
                    <span className="recinto">{a.recinto}</span>
                    <span className="estado" style={{ background: colors.bg, color: colors.fg }}>• {a.estado}</span>
                    <span className="hora">{a.hora}</span>
                  </div>
                )
              })}
            </div>
            <a href="#actas" className="btn dept-all-actas">Ver todas las actas →</a>
          </div>
        </div>
      </section>
    </div>
  )
}

export function PipelinePage() {
  const steps = [
    ['1', 'Command side', 'Recepcion de fotos, SMS y CSV oficial con validacion de formato.'],
    ['2', 'Event store', 'Registro append-only de acta_recibida, ocr_extraido, sms_validado y oficial_importado.'],
    ['3', 'Procesamiento asincrono', 'Workers aplican OCR, deduplicacion, reintentos e idempotencia.'],
    ['4', 'Read models', 'Tablas/materialized views optimizadas para dashboard y consultas publicas.'],
  ]
  return (
    <div className="page-stack">
      <section className="card">
        <div className="card-title">CQRS + <em>Event Sourcing</em></div>
        <div className="pipeline">
          {steps.map(step => (
            <div className="pipeline-step" key={step[0]}>
              <b>{step[0]}</b>
              <strong>{step[1]}</strong>
              <span>{step[2]}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="page-grid page-grid--3">
        <MiniMetric label="Throughput" value={`${techMetrics.throughput}/min`} note="actas procesadas" />
        <MiniMetric label="Disponibilidad" value={`${techMetrics.disponibilidad}%`} note="cluster sincronizado" />
        <MiniMetric label="SMS pendientes" value={techMetrics.smsPendientes} note="revision / firma" />
      </section>
    </div>
  )
}

export function TransparenciaPage() {
  return (
    <div className="page-stack">
      <section className="page-grid page-grid--3">
        <MiniMetric label="Actas publicadas" value={`${((kpis.actasRecibidas / kpis.actasTotal) * 100).toFixed(1)}%`} note="cobertura publica" />
        <MiniMetric label="Inconsistencias" value={techMetrics.inconsistencias} note="RRV vs oficial" />
        <MiniMetric label="Latencia mediana" value={`${kpis.latenciaSeg}s`} note="captura a publicacion" />
      </section>
      <section className="card">
        <div className="card-title">Trazabilidad <em>del procesamiento</em></div>
        <div className="data-table">
          <div className="data-table__head data-table__row--audit">
            <span>Hora</span><span>Actor</span><span>Evento</span><span>Destino</span><span>Hash</span>
          </div>
          {auditEvents.map(e => (
            <div key={`${e.time}-${e.hash}`} className="data-table__row data-table__row--audit">
              <span>{e.time}</span><span>{e.actor}</span><span>{e.action}</span><span>{e.target}</span><span>{e.hash}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
