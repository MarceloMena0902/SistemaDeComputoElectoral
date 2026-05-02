import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { rrvActas as rrvMock } from './data/rrv.mock.js';
import {
  ENABLE_API_SUBMIT,
  RRV_ENABLED,
  apiInfo,
  getAuditoriaOficial,
  getActasOficiales,
  getMetricasDashboard,
  getProgresoAutomatizacion,
  getProgresoOficial,
  getResultadosOficiales,
  getRunsAutomatizacion,
  getRrvActas,
  healthOficial,
  iniciarAutomatizacion,
  registrarActaOficial,
} from './services/api.js';
import {
  PARTIES,
  buildInconsistencias,
  buildKpis,
  clamp,
  compareParties,
  departmentSummary,
  exportJson,
  filterActas,
  fmt,
  pct,
  timelineByHour,
  totals,
  validateOfficialForm,
} from './utils/metrics.js';

const STORAGE_KEY = 'computo_oficial_dashboard_frontend_v1';

const NAV = [
  { id: 'dashboard',      icon: '✦', label: 'Dashboard comparativo' },
  { id: 'formulario',     icon: '▣', label: 'Formulario oficial' },
  { id: 'automatizacion', icon: '⚡', label: 'Automatización' },
  { id: 'actas',          icon: '☷', label: 'Actas oficiales' },
  { id: 'inconsistencias',icon: '◇', label: 'Inconsistencias' },
  { id: 'auditoria',      icon: '⌁', label: 'Auditoría' },
  { id: 'integracion',    icon: '⎇', label: 'Integración técnica' },
];

function loadCustomActas() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

export default function App() {
  const [active, setActive] = useState('dashboard');
  const [customActas, setCustomActas] = useState(loadCustomActas);
  const [backendActas, setBackendActas] = useState([]);
  const [backendLoaded, setBackendLoaded] = useState(false);
  const [backendStatus, setBackendStatus] = useState({ checked: false, ok: false, label: 'sin comprobar' });
  const [rrvActas, setRrvActas] = useState(rrvMock);
  const [rrvStatus, setRrvStatus] = useState({ loaded: false, ok: false, label: RRV_ENABLED ? 'conectando...' : 'mock' });

  const oficialActas = useMemo(() => {
    const base = backendLoaded && backendActas.length > 0 ? backendActas : [];
    const customMap = new Map(customActas.map((a) => [String(a.codigoActa), a]));
    const merged = base.map((a) => customMap.get(String(a.codigoActa)) || a);
    const extras = customActas.filter((a) => !base.some((s) => String(s.codigoActa) === String(a.codigoActa)));
    return [...extras, ...merged];
  }, [customActas, backendActas, backendLoaded]);

  const saveCustomActa = (acta) => {
    setCustomActas((prev) => {
      const next = [acta, ...prev.filter((a) => String(a.codigoActa) !== String(acta.codigoActa))].slice(0, 100);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const checkBackend = useCallback(async () => {
    setBackendStatus({ checked: true, ok: false, label: 'comprobando...' });
    try {
      const res = await healthOficial();
      setBackendStatus({ checked: true, ok: true, label: res?.service || 'backend oficial disponible' });
    } catch {
      setBackendStatus({ checked: true, ok: false, label: 'backend oficial no disponible' });
    }
  }, []);

  const fetchBackendActas = useCallback(async () => {
    try {
      const data = await getActasOficiales({ limit: 500 });
      setBackendActas(data.items || []);
      setBackendLoaded(true);
    } catch {
      setBackendLoaded(false);
    }
  }, []);

  const fetchRrvActas = useCallback(async () => {
    if (!RRV_ENABLED) return;
    setRrvStatus({ loaded: false, ok: false, label: 'conectando...' });
    try {
      const data = await getRrvActas(1000);
      if (data.actas.length > 0) {
        setRrvActas(data.actas);
        setRrvStatus({ loaded: true, ok: true, label: `${data.actas.length} actas RRV reales` });
      } else {
        setRrvStatus({ loaded: true, ok: true, label: 'RRV vacío — usando mock' });
      }
    } catch (e) {
      setRrvStatus({ loaded: true, ok: false, label: `Error RRV: ${e.message}` });
    }
  }, []);

  useEffect(() => {
    checkBackend().then(() => {});
  }, [checkBackend]);

  useEffect(() => {
    if (backendStatus.ok) {
      fetchBackendActas();
    }
  }, [backendStatus.ok, fetchBackendActas]);

  useEffect(() => {
    fetchRrvActas();
  }, [fetchRrvActas]);

  const page = {
    dashboard:       <Dashboard oficial={oficialActas} rrv={rrvActas} />,
    formulario:      <Formulario oficial={oficialActas} onSave={saveCustomActa} backendStatus={backendStatus} onCheckBackend={checkBackend} />,
    automatizacion:  <AutomatizacionPage backendStatus={backendStatus} onRefreshActas={fetchBackendActas} />,
    actas:           <ActasPage oficial={oficialActas} backendLoaded={backendLoaded} onRefresh={fetchBackendActas} />,
    inconsistencias: <InconsistenciasPage oficial={oficialActas} rrv={rrvActas} />,
    auditoria:       <AuditoriaPage oficial={oficialActas} backendStatus={backendStatus} />,
    integracion:     <IntegracionPage backendStatus={backendStatus} rrvStatus={rrvStatus} onCheckBackend={checkBackend} onRefreshRrv={fetchRrvActas} />,
  }[active];

  return (
    <div className="appShell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">CE</div>
          <div>
            <strong>Cómputo Electoral</strong>
            <span>Formulario oficial + comparación</span>
          </div>
        </div>
        <nav>
          {NAV.map((item) => (
            <button key={item.id} className={`navItem ${active === item.id ? 'active' : ''}`} onClick={() => setActive(item.id)}>
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="sideStatus">
          <small>Estado de integración</small>
          <div className="statusLine"><i className={backendStatus.ok ? 'dot ok' : 'dot warn'} /> Oficial: {backendStatus.ok ? 'conectado' : 'modo demo'}</div>
          <div className="statusLine"><i className={backendLoaded ? 'dot ok' : 'dot info'} /> Actas: {backendLoaded ? `${backendActas.length} cargadas` : 'sin datos reales'}</div>
          <div className="statusLine"><i className={rrvStatus.ok ? 'dot ok' : RRV_ENABLED ? 'dot warn' : 'dot info'} /> RRV: {rrvStatus.label}</div>
          <button className="miniButton" onClick={checkBackend}>Comprobar backend</button>
        </div>
      </aside>
      <main className="mainContent">{page}</main>
    </div>
  );
}

function PageHeader({ eyebrow, title, subtitle, children }) {
  return (
    <header className="pageHeader">
      <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{subtitle}</p></div>
      <div className="headerActions">{children}</div>
    </header>
  );
}

function Card({ className = '', children }) { return <section className={`card ${className}`}>{children}</section>; }
function Pill({ children, tone = 'neutral' }) { return <span className={`pill ${tone}`}>{children}</span>; }
function Kpi({ label, value, hint, tone = 'blue', icon = '•' }) {
  return (
    <div className={`kpi ${tone}`}>
      <div className="kpiOrb" /><div className="kpiIcon">{icon}</div>
      <span>{label}</span><strong>{value}</strong><small>{hint}</small>
    </div>
  );
}

function getUniqueOptions(data, key, predicate = () => true) {
  return [...new Set(data.filter(predicate).map((a) => a[key]).filter((v) => v !== undefined && v !== null && String(v).trim() !== ''))]
    .map(String).sort((a, b) => a.localeCompare(b, 'es'));
}

function Filters({ filters, setFilters, data, title = 'Filtros de resultados' }) {
  const byDep = (a) => !filters.departamento || a.departamento === filters.departamento;
  const byProv = (a) => byDep(a) && (!filters.provincia || a.provincia === filters.provincia);
  const byMun = (a) => byProv(a) && (!filters.municipio || a.municipio === filters.municipio);
  const departamentos = getUniqueOptions(data, 'departamento');
  const provincias = getUniqueOptions(data, 'provincia', byDep);
  const municipios = getUniqueOptions(data, 'municipio', byProv);
  const recintos = getUniqueOptions(data, 'recinto', byMun).slice(0, 120);
  const estados = getUniqueOptions(data, 'estado');
  const fuentes = [...new Set(data.flatMap((a) => [a.fuente, a.origen]).filter(Boolean))].map(String).sort();
  const update = (key, value) => setFilters((f) => ({
    ...f, [key]: value,
    ...(key === 'departamento' ? { provincia: '', municipio: '', recinto: '', mesa: '' } : {}),
    ...(key === 'provincia' ? { municipio: '', recinto: '', mesa: '' } : {}),
    ...(key === 'municipio' ? { recinto: '', mesa: '' } : {}),
    ...(key === 'recinto' ? { mesa: '' } : {}),
  }));
  const clear = () => setFilters({ proceso: 'Elecciones Subnacionales 2026', departamento: '', provincia: '', municipio: '', recinto: '', mesa: '', estado: '', fuente: '', q: '' });
  const activeCount = ['departamento', 'provincia', 'municipio', 'recinto', 'mesa', 'estado', 'fuente', 'q'].filter((k) => filters[k]).length;
  return (
    <section className="oepFilterPanel glass">
      <div className="filterHeading">
        <div><span>Vista inspirada en resultados OEP</span><strong>{title}</strong></div>
        <Pill tone={activeCount ? 'warning' : 'neutral'}>{activeCount ? `${activeCount} filtros activos` : 'Sin filtros'}</Pill>
      </div>
      <div className="filters filtersOep">
        <label><span>Proceso</span><select value={filters.proceso || ''} onChange={(e) => update('proceso', e.target.value)}><option>Elecciones Subnacionales 2026</option><option>Elección nacional / demo académica</option></select></label>
        <label><span>Departamento</span><select value={filters.departamento || ''} onChange={(e) => update('departamento', e.target.value)}><option value="">Todos</option>{departamentos.map((d) => <option key={d}>{d}</option>)}</select></label>
        <label><span>Provincia</span><select value={filters.provincia || ''} onChange={(e) => update('provincia', e.target.value)}><option value="">Todas</option>{provincias.map((d) => <option key={d}>{d}</option>)}</select></label>
        <label><span>Municipio</span><select value={filters.municipio || ''} onChange={(e) => update('municipio', e.target.value)}><option value="">Todos</option>{municipios.map((d) => <option key={d}>{d}</option>)}</select></label>
        <label><span>Recinto</span><select value={filters.recinto || ''} onChange={(e) => update('recinto', e.target.value)}><option value="">Todos</option>{recintos.map((d) => <option key={d}>{d}</option>)}</select></label>
        <label><span>Mesa</span><input inputMode="numeric" pattern="[0-9]*" value={filters.mesa || ''} onChange={(e) => update('mesa', onlyDigits(e.target.value))} placeholder="Ej. 4" /></label>
        <label><span>Estado</span><select value={filters.estado || ''} onChange={(e) => update('estado', e.target.value)}><option value="">Todos</option>{estados.map((d) => <option key={d}>{d}</option>)}</select></label>
        <label><span>Fuente</span><select value={filters.fuente || ''} onChange={(e) => update('fuente', e.target.value)}><option value="">Todas</option>{fuentes.map((d) => <option key={d}>{d}</option>)}</select></label>
        <label className="searchWide"><span>Buscar acta, mesa, recinto</span><input value={filters.q || ''} onChange={(e) => update('q', e.target.value)} placeholder="Código de acta, recinto, municipio..." /></label>
        <button className="ghost clearFilter" onClick={clear}>Limpiar filtros</button>
      </div>
    </section>
  );
}

// ─── DASHBOARD ───────────────────────────────────────────────────
function Dashboard({ oficial, rrv }) {
  const [filters, setFilters] = useState({ proceso: 'Elecciones Subnacionales 2026', departamento: '', provincia: '', municipio: '', recinto: '', mesa: '', estado: '', fuente: '', q: '' });
  const [metricas, setMetricas] = useState(null);
  const oficialF = useMemo(() => filterActas(oficial, filters), [oficial, filters]);
  const rrvF = useMemo(() => filterActas(rrv, filters), [rrv, filters]);
  const kpis = useMemo(() => buildKpis(oficialF, rrvF), [oficialF, rrvF]);
  const compare = useMemo(() => compareParties(oficialF, rrvF), [oficialF, rrvF]);
  const deps = useMemo(() => departmentSummary(oficialF, rrvF), [oficialF, rrvF]);
  const inconsistencias = useMemo(() => buildInconsistencias(oficialF, rrvF), [oficialF, rrvF]);
  const timeline = useMemo(() => timelineByHour(rrvF), [rrvF]);

  useEffect(() => {
    getMetricasDashboard().then(setMetricas).catch(() => {});
  }, [oficial.length]);

  const avance = clamp(metricas?.porcentaje_avance ?? kpis.avance ?? 0, 0, 100);

  return (
    <>
      <PageHeader eyebrow="Dashboard analítico" title="RRV vs Cómputo Oficial" subtitle="Vista comparativa PostgreSQL oficial vs MongoDB RRV.">
        <button className="primary" onClick={() => exportJson('comparativo-rrv-vs-oficial.json', { kpis, compare, inconsistencias: inconsistencias.slice(0, 80) })}>Exportar JSON</button>
      </PageHeader>
      <Filters filters={filters} setFilters={setFilters} data={[...oficial, ...rrv]} title="Filtro territorial y de actas" />

      <section className="oepProgressGrid">
        <Card className="progressHero">
          <div><p className="eyebrow">Progreso de cómputo</p><h2>{avance.toFixed(2)}% de actas procesadas</h2></div>
          <div className="progressRail"><span style={{ width: `${avance}%` }} /></div>
          <div className="progressMini">
            <span><b>{fmt(metricas?.total_actas ?? kpis.actasOficial)}</b> Oficiales</span>
            <span><b>{fmt(kpis.actasRRV)}</b> RRV</span>
            <span><b>{fmt(kpis.actasObservadas)}</b> Observadas</span>
          </div>
        </Card>
        {metricas && (
          <Card className="territoryMini">
            <p className="eyebrow">KPIs en tiempo real (PostgreSQL)</p>
            <div className="progressMini" style={{flexWrap:'wrap',gap:'8px'}}>
              {(metricas.por_estado || []).map((e) => (
                <span key={e.estado}><b>{fmt(e.total)}</b> {e.estado}</span>
              ))}
            </div>
            <p className="muted" style={{marginTop:8}}>Participación: <b>{(metricas.participacion_pct || 0).toFixed(2)}%</b></p>
          </Card>
        )}
      </section>

      <section className="kpiGrid">
        <Kpi icon="Ⓡ" label="Actas RRV" value={fmt(kpis.actasRRV)} hint="conteo rápido" />
        <Kpi icon="Ⓞ" label="Actas oficiales" value={fmt(metricas?.total_actas ?? kpis.actasOficial)} hint="cómputo oficial" tone="green" />
        <Kpi icon="↯" label="Diferencia global" value={`${kpis.diferenciaGlobal >= 0 ? '+' : ''}${fmt(kpis.diferenciaGlobal)}`} hint="Oficial − RRV" tone={Math.abs(kpis.diferenciaGlobal) > 300 ? 'red' : 'gold'} />
        <Kpi icon="◌" label="Participación" value={`${(metricas?.participacion_pct ?? kpis.participacion).toFixed(2)}%`} hint="sobre habilitados" tone="purple" />
        <Kpi icon="!" label="Inconsistencias" value={fmt(kpis.inconsistencias)} hint="campo por campo" tone="red" />
        <Kpi icon="★" label="Ganador oficial" value={kpis.ganador} hint={`margen ${fmt(kpis.margenVictoria)}`} tone="blue" />
      </section>

      <section className="heroGrid">
        <Card className="wide"><h2>Comparación nacional por partido</h2><CompareBars data={compare} /></Card>
        <Card><h2>Voto oficial</h2><Donut total={metricas?.total_votos ?? kpis.oficial.totalVotos} validos={metricas?.total_votos_validos ?? kpis.oficial.votosValidos} blancos={metricas?.total_votos_blancos ?? kpis.oficial.votosBlancos} nulos={metricas?.total_votos_nulos ?? kpis.oficial.votosNulos} /></Card>
      </section>
      <section className="heroGrid">
        <Card><h2>Recepción RRV por hora</h2><LineMini data={timeline} /></Card>
        <Card className="wide"><CandidateResultsTable rows={compare} /></Card>
      </section>
      <section className="heroGrid">
        <Card><h2>Diferencia territorial</h2><HeatMap rows={deps.slice(0, 9)} /></Card>
        <Card className="wide"><TerritoryResultsTable rows={deps.slice(0, 12)} /></Card>
      </section>
      <section className="heroGrid single">
        <Card className="wide"><TableInconsistencias rows={inconsistencias.slice(0, 8)} /></Card>
      </section>
    </>
  );
}

function CompareBars({ data }) {
  const max = Math.max(...data.flatMap((r) => [r.rrv, r.oficial]), 1);
  return <div className="compareBars">{data.map((row) => (
    <div className="compareRow" key={row.key}>
      <div><strong>{row.name}</strong><span>{row.diff >= 0 ? '+' : ''}{fmt(row.diff)} votos</span></div>
      <div className="barStack">
        <div className="barLine rrv" style={{ width: `${clamp((row.rrv * 100) / max, 6, 100)}%` }}><span>RRV {fmt(row.rrv)}</span></div>
        <div className="barLine oficial" style={{ width: `${clamp((row.oficial * 100) / max, 6, 100)}%` }}><span>Oficial {fmt(row.oficial)}</span></div>
      </div>
      <strong className={Math.abs(row.diffPct) > 1 ? 'dangerText' : 'okText'}>{row.diffPct.toFixed(2)}%</strong>
    </div>
  ))}</div>;
}

function Donut({ total, validos, blancos, nulos }) {
  const safe = total || 1;
  const a = (validos * 100) / safe, b = (blancos * 100) / safe, c = (nulos * 100) / safe;
  return <div className="donutWrap">
    <div className="donut" style={{ background: `conic-gradient(#2dd4bf 0 ${a}%, #e2e8f0 ${a}% ${a + b}%, #fb7185 ${a + b}% ${a + b + c}%)` }}><div><strong>{fmt(total)}</strong><span>Total votos</span></div></div>
    <div className="legendList">
      <span><i className="swatch teal" /> Válidos <b>{pct(validos, total)}</b></span>
      <span><i className="swatch white" /> Blancos <b>{pct(blancos, total)}</b></span>
      <span><i className="swatch red" /> Nulos <b>{pct(nulos, total)}</b></span>
    </div>
  </div>;
}

function LineMini({ data }) {
  const max = Math.max(...data.map((d) => d.actas), 1);
  const points = data.map((d, i) => `${(i / Math.max(data.length - 1, 1)) * 100},${90 - (d.actas / max) * 72}`).join(' ');
  return <div className="lineBox"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={points} /></svg><div className="lineLabels">{data.map((d) => <span key={d.hora}><b>{d.hora}</b>{d.actas} actas</span>)}</div></div>;
}

function HeatMap({ rows }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.diff)), 1);
  return <div className="heatMap">{rows.map((r) => (
    <div className="heatCell" key={r.departamento} style={{ '--heat': Math.abs(r.diff) / max }}>
      <strong>{r.departamento}</strong><span>{r.diff >= 0 ? '+' : ''}{fmt(r.diff)}</span>
      <small>{r.actasOficial}/{r.actasRRV} actas · {r.participacion.toFixed(1)}%</small>
    </div>
  ))}</div>;
}

function CandidateResultsTable({ rows }) {
  const totalOficial = rows.reduce((acc, row) => acc + Number(row.oficial || 0), 0) || 1;
  return <div>
    <div className="tableHeader"><h2>Resultados por organización política</h2><span>Formato similar a cómputo oficial</span></div>
    <div className="candidateList">{rows.map((r) => (
      <div className="candidateRow" key={r.key}>
        <div><strong>{r.name}</strong><small>Oficial {pct(r.oficial, totalOficial)} · Diff {r.diff >= 0 ? '+' : ''}{fmt(r.diff)}</small></div>
        <div className="candidateBar"><span style={{ width: `${clamp((r.oficial * 100) / totalOficial, 2, 100)}%` }} /></div>
        <b>{fmt(r.oficial)}</b>
      </div>
    ))}</div>
  </div>;
}

function TerritoryResultsTable({ rows }) {
  return <div>
    <div className="tableHeader"><h2>Resultados por territorio</h2><span>Departamento / avance / diferencia</span></div>
    <div className="tableWrap"><table><thead><tr><th>Departamento</th><th>Actas RRV</th><th>Actas oficiales</th><th>Votos RRV</th><th>Votos oficiales</th><th>Diferencia</th><th>Participación</th></tr></thead><tbody>
      {rows.map((r) => <tr key={r.departamento}><td><b>{r.departamento}</b></td><td>{fmt(r.actasRRV)}</td><td>{fmt(r.actasOficial)}</td><td>{fmt(r.rrv)}</td><td>{fmt(r.oficial)}</td><td className={Math.abs(r.diff) > 500 ? 'dangerText' : 'goldText'}>{r.diff >= 0 ? '+' : ''}{fmt(r.diff)}</td><td>{r.participacion.toFixed(2)}%</td></tr>)}
    </tbody></table></div>
  </div>;
}

// ─── FORMULARIO ──────────────────────────────────────────────────
function Formulario({ oficial, onSave, backendStatus, onCheckBackend }) {
  const [selected, setSelected] = useState(oficial[0]?.codigoActa || '');
  const base = oficial.find((a) => String(a.codigoActa) === String(selected)) || oficial[0];
  const [form, setForm] = useState(() => toForm(base));
  const [result, setResult] = useState(null);

  useEffect(() => { setForm(toForm(base)); setResult(null); }, [selected]);
  const validation = useMemo(() => validateOfficialForm(form, oficial), [form, oficial]);
  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    const hardErrors = validation.issues.filter((i) => i.type === 'ERROR');
    if (hardErrors.length) {
      setResult({ ok: false, text: 'No se puede guardar: errores de validación.', response: hardErrors.map((i) => i.text) });
      return;
    }
    const saved = {
      ...form,
      estado: validation.estadoVisual === 'PROCESADA' ? 'VALIDA' : validation.estadoVisual === 'OBSERVADA' ? 'OBSERVADA_PENDIENTE_REVISION' : validation.estadoVisual,
      votosValidos: validation.votosValidosCalculados,
      totalVotos: validation.totalCalculado,
      fechaRegistro: new Date().toISOString(),
    };
    onSave(saved);
    if (ENABLE_API_SUBMIT) {
      try {
        const response = await registrarActaOficial(validation.backendPayload);
        setResult({ ok: true, text: 'Acta validada y enviada al servicio oficial.', response });
      } catch (e) {
        if (e.status === 423) {
          setResult({ ok: false, text: 'Automatización en progreso. Espere a que finalice.', response: e.body });
        } else {
          setResult({ ok: false, text: 'Acta validada localmente, pero el servicio oficial no respondió.', response: e.body || e.message });
        }
      }
    } else {
      setResult({ ok: true, text: 'Acta validada en modo demostración. Payload listo para integración.', response: validation.backendPayload });
    }
  };

  return <>
    <PageHeader eyebrow="Cómputo oficial" title="Formulario Oficial" subtitle="Captura y validación visual antes de enviar a PostgreSQL oficial.">
      <button className="ghost" onClick={onCheckBackend}>Comprobar backend</button>
      <button className="primary" onClick={save}>Guardar acta</button>
    </PageHeader>
    <Card className="formTop glass">
      <label><span>Acta base de prueba</span><select value={selected} onChange={(e) => setSelected(e.target.value)}>{oficial.slice(0, 140).map((a) => <option key={a.codigoActa} value={a.codigoActa}>Acta {a.nroActa} · Mesa {a.nroMesa} · {a.recinto}</option>)}</select></label>
      <Pill tone={validation.estadoVisual === 'RECHAZADA' ? 'danger' : validation.estadoVisual === 'OBSERVADA' ? 'warning' : 'ok'}>{validation.estadoVisual}</Pill>
      <Pill tone={backendStatus.ok ? 'ok' : 'neutral'}>{backendStatus.ok ? 'Servicio disponible' : 'Modo demo'}</Pill>
    </Card>
    <section className="formLayout">
      <Card className="formPanel span2"><h2>Datos oficiales del acta</h2><div className="fields grid4">
        <Input label="Número de acta" value={form.nroActa} onChange={(v) => update('nroActa', v)} text />
        <Input label="Código de mesa" value={form.codigoMesa} onChange={(v) => update('codigoMesa', v)} />
        <Input label="Nro mesa" value={form.nroMesa} onChange={(v) => update('nroMesa', v)} />
        <Input label="Código territorial" value={form.codigoTerritorial} onChange={(v) => update('codigoTerritorial', v)} />
        <Input label="Votantes habilitados" value={form.votantesHabilitados} onChange={(v) => update('votantesHabilitados', v)} />
        <Input label="Papeletas ánfora" value={form.papeletasAnfora} onChange={(v) => update('papeletasAnfora', v)} />
        <Input label="Papeletas no utilizadas" value={form.papeletasNoUtilizadas} onChange={(v) => update('papeletasNoUtilizadas', v)} />
        <Input label="Registrado por ID" value={form.registradoPor} onChange={(v) => update('registradoPor', v)} />
      </div></Card>
      <Card className="formPanel"><h2>Ubicación</h2><div className="fields">
        <Input label="Departamento" value={form.departamento} onChange={(v) => update('departamento', v)} text />
        <Input label="Provincia" value={form.provincia} onChange={(v) => update('provincia', v)} text />
        <Input label="Municipio" value={form.municipio} onChange={(v) => update('municipio', v)} text />
        <Input label="Recinto" value={form.recinto} onChange={(v) => update('recinto', v)} text />
      </div></Card>
      <Card className="formPanel"><h2>Votos</h2><div className="fields grid2">
        {['p1','p2','p3','p4','votosBlancos','votosNulos'].map((key) => <Input key={key} label={labelFor(key)} value={form[key]} onChange={(v) => update(key, v)} />)}
      </div></Card>
      <Card className="formPanel"><h2>Validación automática</h2>
        <div className={`megaStatus ${validation.estadoVisual.toLowerCase()}`}><strong>{validation.estadoVisual}</strong><span>Total calculado: {fmt(validation.totalCalculado)}</span></div>
        <div className="issueList">{validation.issues.map((i, idx) => <div key={idx} className={`issue ${i.type.toLowerCase()}`}>{i.type === 'OK' ? '✓' : i.type === 'WARNING' ? '⚠' : '✕'} {i.text}</div>)}</div>
      </Card>
      <Card className="formPanel"><h2>Payload para backend</h2><pre className="codeBlock">{JSON.stringify(validation.backendPayload, null, 2)}</pre></Card>
      <Card className="formPanel span2"><h2>Observaciones y respuesta</h2>
        <div className="fields grid2">
          <label><span>Observación oficial</span><textarea value={form.observaciones || ''} onChange={(e) => update('observaciones', e.target.value)} /></label>
          <label><span>Observación técnica</span><textarea value={form.observacionTecnica || ''} onChange={(e) => update('observacionTecnica', e.target.value)} /></label>
        </div>
        {result && <div className={`resultBox ${result.ok ? 'ok' : 'error'}`}><strong>{result.text}</strong><pre>{JSON.stringify(result.response, null, 2)}</pre></div>}
      </Card>
    </section>
  </>;
}

// ─── AUTOMATIZACIÓN ──────────────────────────────────────────────
function AutomatizacionPage({ backendStatus, onRefreshActas }) {
  const [runId, setRunId]       = useState(null);
  const [progreso, setProgreso] = useState(null);
  const [error, setError]       = useState('');
  const [runs, setRuns]         = useState([]);
  const pollRef                 = useRef(null);

  const loadRuns = async () => {
    try { setRuns(await getRunsAutomatizacion()); } catch { }
  };

  useEffect(() => { loadRuns(); }, []);

  const startPolling = (id) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const p = await getProgresoAutomatizacion(id);
        setProgreso(p);
        if (p.estado === 'COMPLETADO' || p.estado?.startsWith('ERROR')) {
          clearInterval(pollRef.current);
          loadRuns();
          onRefreshActas();
        }
      } catch { }
    }, 1500);
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handleIniciar = async () => {
    if (!backendStatus.ok) { setError('Backend no disponible.'); return; }
    setError('');
    setProgreso(null);
    try {
      const res = await iniciarAutomatizacion();
      setRunId(res.run_id);
      startPolling(res.run_id);
    } catch (e) {
      if (e.status === 423) setError('Ya hay una automatización en progreso.');
      else setError(`Error al iniciar: ${e.body?.detail || e.message}`);
    }
  };

  const running   = progreso && progreso.estado === 'EN_PROGRESO';
  const completed = progreso && progreso.estado === 'COMPLETADO';
  const pct       = progreso ? progreso.porcentaje : 0;

  return <>
    <PageHeader eyebrow="Carga masiva" title="Automatización" subtitle="Carga las ~5396 actas del CSV de Transcripciones en la base de datos oficial.">
      <button
        className="primary"
        onClick={handleIniciar}
        disabled={running || !backendStatus.ok}
      >
        {running ? '⏳ Procesando...' : '⚡ Iniciar automatización'}
      </button>
    </PageHeader>

    {error && <div className="resultBox error"><strong>{error}</strong></div>}

    {progreso && (
      <section className="heroGrid">
        <Card className="progressHero">
          <div><p className="eyebrow">Estado: <b>{progreso.estado}</b></p><h2>{pct.toFixed(1)}% completado</h2></div>
          <div className="progressRail"><span style={{ width: `${pct}%`, background: completed ? '#2dd4bf' : '#6366f1', transition: 'width 0.5s ease' }} /></div>
          <div className="progressMini">
            <span><b>{fmt(progreso.procesadas)}</b> / {fmt(progreso.total)} procesadas</span>
            <span style={{color:'#2dd4bf'}}><b>{fmt(progreso.exitosas)}</b> exitosas</span>
            <span style={{color:'#fb7185'}}><b>{fmt(progreso.errores)}</b> errores</span>
            <span style={{color:'#f59e0b'}}><b>{fmt(progreso.observadas)}</b> observadas</span>
            <span style={{color:'#94a3b8'}}><b>{fmt(progreso.duplicadas)}</b> duplicadas</span>
          </div>
        </Card>

        <Card>
          <p className="eyebrow">Feed en vivo {running ? '🔴' : '⏹'}</p>
          <h2>Últimas actas procesadas</h2>
          <div className="timeline" style={{maxHeight:320,overflowY:'auto'}}>
            {(progreso.recientes || []).map((r, i) => (
              <div className="timeItem" key={i} style={{opacity: running ? 1 : 0.7}}>
                <span style={{color: r.estado === 'VALIDA' ? '#2dd4bf' : r.estado === 'OBSERVADA_PENDIENTE_REVISION' ? '#f59e0b' : r.estado === 'DUPLICADA' ? '#94a3b8' : '#fb7185'}}>
                  {r.estado}
                </span>
                <strong>{r.nro_acta}</strong>
              </div>
            ))}
            {(!progreso.recientes || progreso.recientes.length === 0) && (
              <p className="muted">Esperando datos...</p>
            )}
          </div>
        </Card>
      </section>
    )}

    {!progreso && (
      <Card>
        <p className="eyebrow">Instrucciones</p>
        <h2>Cómo funciona la automatización</h2>
        <ul className="prettyList">
          <li>Las primeras <b>15 actas</b> se procesan una a una (simulación visual de entrada humana).</li>
          <li>El resto (~5381 actas) se cargan en paralelo con <b>4 workers</b> concurrentes.</li>
          <li>Cada acta pasa por el <b>validador</b> antes de persistirse en PostgreSQL.</li>
          <li>Las actas rechazadas o duplicadas se registran en logs pero <b>no se escriben</b> en la BD.</li>
          <li>Al terminar, el dashboard se actualiza con los datos reales.</li>
        </ul>
        {!backendStatus.ok && <div className="resultBox error"><strong>Backend no disponible. Levanta el servicio con Docker Compose primero.</strong></div>}
      </Card>
    )}

    {runs.length > 0 && (
      <Card>
        <div className="tableHeader"><h2>Historial de ejecuciones</h2><button className="ghost" onClick={loadRuns}>Actualizar</button></div>
        <div className="tableWrap"><table><thead><tr><th>ID</th><th>Estado</th><th>Total</th><th>Exitosas</th><th>Errores</th><th>Obs.</th><th>Dup.</th><th>Iniciado</th></tr></thead><tbody>
          {runs.map((r) => (
            <tr key={r.id}>
              <td>{r.id}</td>
              <td><Pill tone={r.estado === 'COMPLETADO' ? 'ok' : r.estado === 'EN_PROGRESO' ? 'warning' : r.estado?.startsWith('ERROR') ? 'danger' : 'neutral'}>{r.estado}</Pill></td>
              <td>{fmt(r.total)}</td>
              <td style={{color:'#2dd4bf'}}>{fmt(r.exitosas)}</td>
              <td style={{color:'#fb7185'}}>{fmt(r.errores)}</td>
              <td>{fmt(r.observadas)}</td>
              <td>{fmt(r.duplicadas)}</td>
              <td><small>{String(r.iniciado_en || '').replace('T',' ').slice(0,19)}</small></td>
            </tr>
          ))}
        </tbody></table></div>
      </Card>
    )}
  </>;
}

// ─── ACTAS ───────────────────────────────────────────────────────
function ActasPage({ oficial, backendLoaded, onRefresh }) {
  const [filters, setFilters] = useState({ proceso: '', departamento: '', provincia: '', municipio: '', recinto: '', mesa: '', estado: '', fuente: '', q: '' });
  const rows = useMemo(() => filterActas(oficial, filters), [oficial, filters]);
  return <>
    <PageHeader eyebrow="Cómputo oficial" title="Actas Oficiales" subtitle={backendLoaded ? `${oficial.length} actas cargadas desde PostgreSQL.` : 'Sin datos reales — inicia la automatización.'}>
      <button className="ghost" onClick={onRefresh}>Actualizar</button>
      <button className="primary" onClick={() => exportJson('actas-oficiales.json', rows)}>Exportar</button>
    </PageHeader>
    <Filters filters={filters} setFilters={setFilters} data={oficial} title="Filtro de actas oficiales" />
    <Card>
      <div className="tableHeader"><h2>{fmt(rows.length)} actas</h2><span>{backendLoaded ? 'Datos reales de PostgreSQL' : 'Sin datos del backend'}</span></div>
      <ResponsiveTable rows={rows.slice(0, 100)} />
    </Card>
  </>;
}

function ResponsiveTable({ rows }) {
  return <div className="tableWrap"><table><thead><tr><th>Acta</th><th>Mesa</th><th>Departamento</th><th>Municipio</th><th>Recinto</th><th>Total</th><th>Estado</th><th>Nota técnica</th></tr></thead><tbody>
    {rows.map((a) => (
      <tr key={a.codigoActa}>
        <td><b>{a.nroActa}</b></td><td>{a.nroMesa}</td><td>{a.departamento}</td><td>{a.municipio}</td>
        <td>{a.recinto}</td><td>{fmt(a.totalVotos)}</td>
        <td><Pill tone={String(a.estado).includes('OBS') ? 'warning' : String(a.estado).includes('RECH') ? 'danger' : 'ok'}>{a.estado}</Pill></td>
        <td>{a.observacionTecnica ? <Pill tone="warning">Sí</Pill> : <span className="mutedText">—</span>}</td>
      </tr>
    ))}
  </tbody></table></div>;
}

// ─── INCONSISTENCIAS ─────────────────────────────────────────────
function InconsistenciasPage({ oficial, rrv }) {
  const rows = useMemo(() => buildInconsistencias(oficial, rrv), [oficial, rrv]);
  return <>
    <PageHeader eyebrow="Comparación" title="Inconsistencias RRV vs Oficial" subtitle="Diferencias campo por campo.">
      <button className="primary" onClick={() => exportJson('inconsistencias.json', rows)}>Exportar</button>
    </PageHeader>
    <Card><TableInconsistencias rows={rows.slice(0, 120)} full /></Card>
  </>;
}

function TableInconsistencias({ rows, full = false }) {
  return <><div className="tableHeader"><h2>Inconsistencias detectadas</h2><span>{rows.length} registros</span></div>
    <div className="tableWrap"><table><thead><tr><th>Acta</th><th>Mesa</th><th>Depto.</th>{full && <th>Recinto</th>}<th>Campo</th><th>RRV</th><th>Oficial</th><th>Diff</th><th>Criticidad</th>{full && <th>Nota</th>}</tr></thead><tbody>
      {rows.map((r, idx) => <tr key={`${r.codigoActa}-${r.campo}-${idx}`}>
        <td><b>{r.codigoActa}</b></td><td>{r.nroMesa}</td><td>{r.departamento}</td>{full && <td>{r.recinto}</td>}
        <td>{r.campo}</td><td>{fmt(r.rrv)}</td><td>{fmt(r.oficial)}</td>
        <td className={Math.abs(r.diff) >= 8 ? 'dangerText' : 'goldText'}>{r.diff >= 0 ? '+' : ''}{fmt(r.diff)}</td>
        <td><Pill tone={r.criticidad === 'ALTA' ? 'danger' : r.criticidad === 'MEDIA' ? 'warning' : 'neutral'}>{r.criticidad}</Pill></td>
        {full && <td>{r.observacionTecnica || '—'}</td>}
      </tr>)}
    </tbody></table></div></>;
}

// ─── AUDITORÍA ───────────────────────────────────────────────────
function AuditoriaPage({ oficial, backendStatus }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const localLogs = useMemo(() => oficial.slice(0, 20).map((a, i) => ({
    id: `LOCAL-${i}`, fecha: a.fechaRegistro, accion: 'VALIDACION_FRONT',
    detalle: `Acta ${a.nroActa} revisada`, usuario: 'Frontend',
  })), [oficial]);

  const load = async () => {
    setLoading(true);
    try { setLogs(await getAuditoriaOficial(80)); } catch { setLogs([]); }
    setLoading(false);
  };

  return <>
    <PageHeader eyebrow="Trazabilidad" title="Auditoría" subtitle="Historial de acciones sobre actas oficiales.">
      <button className="primary" onClick={load}>{loading ? 'Cargando...' : 'Cargar auditoría backend'}</button>
    </PageHeader>
    <section className="heroGrid">
      <Card><h2>Estado</h2><p className="muted">Backend: <b>{backendStatus.ok ? 'conectado' : 'no conectado'}</b></p></Card>
      <Card className="wide"><h2>Eventos</h2>
        <div className="timeline">{(logs.length ? logs : localLogs).map((log, idx) => (
          <div className="timeItem" key={log.id_auditoria || log.id || idx}>
            <span>{String(log.fecha_accion || log.fecha || '').replace('T',' ').slice(0, 19)}</span>
            <strong>{log.accion}</strong>
            <p>{log.detalle || log.valor_nuevo || 'Sin detalle'}</p>
          </div>
        ))}</div>
      </Card>
    </section>
  </>;
}

// ─── INTEGRACIÓN ─────────────────────────────────────────────────
function IntegracionPage({ backendStatus, rrvStatus, onCheckBackend, onRefreshRrv }) {
  return <>
    <PageHeader eyebrow="Documentación técnica" title="Integración con las bases de datos" subtitle="Este frontend consume PostgreSQL oficial y RRV MongoDB.">
      <button className="ghost" onClick={onRefreshRrv}>Reconectar RRV</button>
      <button className="primary" onClick={onCheckBackend}>Probar backend oficial</button>
    </PageHeader>
    <section className="architecture">
      <Card>
        <h2>Base oficial PostgreSQL</h2>
        <img src="/diagrama-postgresql-oficial.png" alt="PostgreSQL" />
        <p>Primary/Standby Streaming Replication + HAProxy HA. Tablas: acta_oficial, voto_oficial, auditoria_voto.</p>
        <Pill tone={backendStatus.ok ? 'ok' : 'danger'}>{backendStatus.ok ? 'Conectado' : 'No disponible'}</Pill>
      </Card>
      <Card>
        <h2>Base RRV MongoDB</h2>
        <img src="/diagrama-mongodb-rrv.png" alt="MongoDB" />
        <p>Cluster RRV — actas preliminares procesadas por OCR/SMS. Configura <code>VITE_RRV_API_URL</code> en tu <code>.env</code> para conectar al cluster real.</p>
        <Pill tone={rrvStatus.ok ? 'ok' : RRV_ENABLED ? 'danger' : 'neutral'}>{rrvStatus.label}</Pill>
      </Card>
    </section>
    <Card>
      <h2>Configuración detectada</h2>
      <pre className="codeBlock">{JSON.stringify({ backendStatus, rrvStatus, apiInfo }, null, 2)}</pre>
    </Card>
  </>;
}

// ─── Helpers del formulario ───────────────────────────────────────
function toForm(a = {}) {
  return {
    ...a,
    nroActa: a.nroActa || `ACTA-${a.codigoActa || ''}`,
    codigoMesa: a.codigoMesa || a.codigoActa || '',
    registradoPor: a.registradoPor || 1,
  };
}

function labelFor(k) {
  return ({ p1: 'Partido 1', p2: 'Partido 2', p3: 'Partido 3', p4: 'Partido 4', votosBlancos: 'Votos blancos', votosNulos: 'Votos nulos' })[k] || k;
}

function onlyDigits(value) { return String(value ?? '').replace(/[^0-9]/g, ''); }
function cleanText(value) { return String(value ?? '').replace(/[<>\{\}\[\]$;`]/g, ''); }

function Input({ label, value, onChange, text = false }) {
  if (text) {
    return <label><span>{label}</span><input type="text" value={value ?? ''} onChange={(e) => onChange(cleanText(e.target.value))} /></label>;
  }
  return (
    <label><span>{label}</span>
      <input type="text" inputMode="numeric" pattern="[0-9]*" value={value ?? ''}
        onChange={(e) => { const d = onlyDigits(e.target.value); onChange(d === '' ? '' : Number(d)); }}
        onKeyDown={(e) => { const allowed = ['Backspace','Delete','Tab','Escape','Enter','ArrowLeft','ArrowRight','Home','End']; if (allowed.includes(e.key) || e.ctrlKey || e.metaKey) return; if (!/^[0-9]$/.test(e.key)) e.preventDefault(); }}
        onPaste={(e) => { if (/[^0-9]/.test(e.clipboardData.getData('text'))) e.preventDefault(); }}
      />
    </label>
  );
}
