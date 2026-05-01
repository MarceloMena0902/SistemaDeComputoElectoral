import { useEffect, useMemo, useState } from 'react';
import { oficialActas as officialSeed } from './data/oficial.mock.js';
import { rrvActas } from './data/rrv.mock.js';
import { ENABLE_API_SUBMIT, apiInfo, getAuditoriaOficial, getProgresoOficial, getResultadosOficiales, healthOficial, registrarActaOficial } from './services/api.js';
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
  { id: 'dashboard', icon: '✦', label: 'Dashboard comparativo' },
  { id: 'formulario', icon: '▣', label: 'Formulario oficial' },
  { id: 'actas', icon: '☷', label: 'Actas oficiales' },
  { id: 'inconsistencias', icon: '◇', label: 'Inconsistencias' },
  { id: 'auditoria', icon: '⌁', label: 'Auditoría' },
  { id: 'integracion', icon: '⎇', label: 'Integración técnica' },
];

function loadCustomActas() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

export default function App() {
  const [active, setActive] = useState('dashboard');
  const [customActas, setCustomActas] = useState(loadCustomActas);
  const [backendStatus, setBackendStatus] = useState({ checked: false, ok: false, label: 'sin comprobar' });

  const oficialActas = useMemo(() => {
    const customMap = new Map(customActas.map((a) => [String(a.codigoActa), a]));
    const merged = officialSeed.map((a) => customMap.get(String(a.codigoActa)) || a);
    const extras = customActas.filter((a) => !officialSeed.some((s) => String(s.codigoActa) === String(a.codigoActa)));
    return [...extras, ...merged];
  }, [customActas]);

  const saveCustomActa = (acta) => {
    setCustomActas((prev) => {
      const next = [acta, ...prev.filter((a) => String(a.codigoActa) !== String(acta.codigoActa))].slice(0, 100);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const checkBackend = async () => {
    setBackendStatus({ checked: true, ok: false, label: 'comprobando...' });
    try {
      const res = await healthOficial();
      setBackendStatus({ checked: true, ok: true, label: res?.service || 'backend oficial disponible' });
    } catch (e) {
      setBackendStatus({ checked: true, ok: false, label: 'backend oficial no disponible' });
    }
  };

  useEffect(() => { checkBackend(); }, []);

  const page = {
    dashboard: <Dashboard oficial={oficialActas} />,
    formulario: <Formulario oficial={oficialActas} onSave={saveCustomActa} backendStatus={backendStatus} onCheckBackend={checkBackend} />,
    actas: <ActasPage oficial={oficialActas} />,
    inconsistencias: <InconsistenciasPage oficial={oficialActas} />,
    auditoria: <AuditoriaPage oficial={oficialActas} backendStatus={backendStatus} />,
    integracion: <IntegracionPage backendStatus={backendStatus} onCheckBackend={checkBackend} />,
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
          <div className="statusLine"><i className={backendStatus.ok ? 'dot ok' : 'dot warn'} /> Servicio oficial: {backendStatus.ok ? 'conectado' : 'modo demostración'}</div>
          <div className="statusLine"><i className="dot info" /> RRV: datos demo hasta endpoint real</div>
          <button className="miniButton" onClick={checkBackend}>Comprobar backend</button>
        </div>
      </aside>
      <main className="mainContent">
        {page}
      </main>
    </div>
  );
}

function PageHeader({ eyebrow, title, subtitle, children }) {
  return (
    <header className="pageHeader">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="headerActions">{children}</div>
    </header>
  );
}

function Card({ className = '', children }) { return <section className={`card ${className}`}>{children}</section>; }
function Pill({ children, tone = 'neutral' }) { return <span className={`pill ${tone}`}>{children}</span>; }

function Kpi({ label, value, hint, tone = 'blue', icon = '•' }) {
  return (
    <div className={`kpi ${tone}`}>
      <div className="kpiOrb" />
      <div className="kpiIcon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}

function getUniqueOptions(data, key, predicate = () => true) {
  return [...new Set(data.filter(predicate).map((a) => a[key]).filter((v) => v !== undefined && v !== null && String(v).trim() !== ''))]
    .map(String)
    .sort((a, b) => a.localeCompare(b, 'es'));
}

function Filters({ filters, setFilters, data, title = 'Filtros de resultados' }) {
  const byDepartamento = (a) => !filters.departamento || a.departamento === filters.departamento;
  const byProvincia = (a) => byDepartamento(a) && (!filters.provincia || a.provincia === filters.provincia);
  const byMunicipio = (a) => byProvincia(a) && (!filters.municipio || a.municipio === filters.municipio);
  const departamentos = getUniqueOptions(data, 'departamento');
  const provincias = getUniqueOptions(data, 'provincia', byDepartamento);
  const municipios = getUniqueOptions(data, 'municipio', byProvincia);
  const recintos = getUniqueOptions(data, 'recinto', byMunicipio).slice(0, 120);
  const estados = getUniqueOptions(data, 'estado');
  const fuentes = [...new Set(data.flatMap((a) => [a.fuente, a.origen]).filter(Boolean))].map(String).sort();
  const update = (key, value) => setFilters((f) => ({
    ...f,
    [key]: value,
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
        <div>
          <span>Vista inspirada en resultados OEP</span>
          <strong>{title}</strong>
        </div>
        <Pill tone={activeCount ? 'warning' : 'neutral'}>{activeCount ? `${activeCount} filtros activos` : 'Sin filtros'}</Pill>
      </div>
      <div className="filters filtersOep">
        <label><span>Proceso</span><select value={filters.proceso || 'Elecciones Subnacionales 2026'} onChange={(e) => update('proceso', e.target.value)}>
          <option>Elecciones Subnacionales 2026</option>
          <option>Elección nacional / demo académica</option>
        </select></label>
        <label><span>Departamento</span><select value={filters.departamento || ''} onChange={(e) => update('departamento', e.target.value)}><option value="">Todos</option>{departamentos.map((d) => <option key={d}>{d}</option>)}</select></label>
        <label><span>Provincia</span><select value={filters.provincia || ''} onChange={(e) => update('provincia', e.target.value)}><option value="">Todas</option>{provincias.map((d) => <option key={d}>{d}</option>)}</select></label>
        <label><span>Municipio</span><select value={filters.municipio || ''} onChange={(e) => update('municipio', e.target.value)}><option value="">Todos</option>{municipios.map((d) => <option key={d}>{d}</option>)}</select></label>
        <label><span>Recinto</span><select value={filters.recinto || ''} onChange={(e) => update('recinto', e.target.value)}><option value="">Todos</option>{recintos.map((d) => <option key={d}>{d}</option>)}</select></label>
        <label><span>Mesa</span><input inputMode="numeric" pattern="[0-9]*" value={filters.mesa || ''} onChange={(e) => update('mesa', onlyDigits(e.target.value))} placeholder="Ej. 4" /></label>
        <label><span>Estado</span><select value={filters.estado || ''} onChange={(e) => update('estado', e.target.value)}><option value="">Todos</option>{estados.map((d) => <option key={d}>{d}</option>)}</select></label>
        <label><span>Fuente</span><select value={filters.fuente || ''} onChange={(e) => update('fuente', e.target.value)}><option value="">Todas</option>{fuentes.map((d) => <option key={d}>{d}</option>)}</select></label>
        <label className="searchWide"><span>Buscar acta, mesa, recinto o nota</span><input value={filters.q || ''} onChange={(e) => update('q', e.target.value)} placeholder="Buscar por código de acta, recinto, municipio, observación técnica..." /></label>
        <button className="ghost clearFilter" onClick={clear}>Limpiar filtros</button>
      </div>
    </section>
  );
}

function OepProgressPanel({ kpis }) {
  const avance = clamp(kpis.avance || 0, 0, 100);
  return <section className="oepProgressGrid">
    <Card className="progressHero">
      <div>
        <p className="eyebrow">Progreso de cómputo</p>
        <h2>{avance.toFixed(2)}% de actas comparables</h2>
        <p className="muted">Relación entre actas oficiales cargadas y actas RRV disponibles para comparación.</p>
      </div>
      <div className="progressRail"><span style={{ width: `${avance}%` }} /></div>
      <div className="progressMini">
        <span><b>{fmt(kpis.actasOficial)}</b> Oficiales</span>
        <span><b>{fmt(kpis.actasRRV)}</b> RRV</span>
        <span><b>{fmt(kpis.actasObservadas)}</b> Observadas</span>
      </div>
    </Card>
    <Card className="territoryMini">
      <p className="eyebrow">Lectura territorial</p>
      <h2>Filtros por departamento, provincia, municipio, recinto y mesa</h2>
      <p className="muted">Queda listo para conectar los catálogos reales del OEP o de PostgreSQL/MongoDB del equipo.</p>
    </Card>
  </section>;
}

function CandidateResultsTable({ rows }) {
  const totalOficial = rows.reduce((acc, row) => acc + Number(row.oficial || 0), 0) || 1;
  return <div>
    <div className="tableHeader"><h2>Resultados por organización política</h2><span>Formato de lectura similar a cómputo oficial</span></div>
    <div className="candidateList">{rows.map((r) => <div className="candidateRow" key={r.key}>
      <div><strong>{r.name}</strong><small>Oficial {pct(r.oficial, totalOficial)} · Diff {r.diff >= 0 ? '+' : ''}{fmt(r.diff)}</small></div>
      <div className="candidateBar"><span style={{ width: `${clamp((r.oficial * 100) / totalOficial, 2, 100)}%` }} /></div>
      <b>{fmt(r.oficial)}</b>
    </div>)}</div>
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

function Dashboard({ oficial }) {
  const [filters, setFilters] = useState({ proceso: 'Elecciones Subnacionales 2026', departamento: '', provincia: '', municipio: '', recinto: '', mesa: '', estado: '', fuente: '', q: '' });
  const oficialF = useMemo(() => filterActas(oficial, filters), [oficial, filters]);
  const rrvF = useMemo(() => filterActas(rrvActas, filters), [filters]);
  const kpis = useMemo(() => buildKpis(oficialF, rrvF), [oficialF, rrvF]);
  const compare = useMemo(() => compareParties(oficialF, rrvF), [oficialF, rrvF]);
  const deps = useMemo(() => departmentSummary(oficialF, rrvF), [oficialF, rrvF]);
  const inconsistencias = useMemo(() => buildInconsistencias(oficialF, rrvF), [oficialF, rrvF]);
  const timeline = useMemo(() => timelineByHour(rrvF), [rrvF]);
  const source = useMemo(() => sourceSummary(rrvF), [rrvF]);
  const technical = useMemo(() => technicalSummary(oficialF, rrvF), [oficialF, rrvF]);

  return (
    <>
      <PageHeader eyebrow="Dashboard analítico" title="RRV vs Cómputo Oficial" subtitle="Vista comparativa para detectar diferencias entre MongoDB RRV y PostgreSQL oficial.">
        <button className="primary" onClick={() => exportJson('comparativo-rrv-vs-oficial.json', { kpis, compare, technical, inconsistencias: inconsistencias.slice(0, 80) })}>Exportar JSON</button>
      </PageHeader>
      <Filters filters={filters} setFilters={setFilters} data={[...oficial, ...rrvActas]} title="Filtro territorial y de actas" />
      <OepProgressPanel kpis={kpis} />
      <section className="kpiGrid">
        <Kpi icon="Ⓡ" label="Actas RRV" value={fmt(kpis.actasRRV)} hint="conteo rápido" />
        <Kpi icon="Ⓞ" label="Actas oficiales" value={fmt(kpis.actasOficial)} hint="cómputo oficial" tone="green" />
        <Kpi icon="↯" label="Diferencia global" value={`${kpis.diferenciaGlobal >= 0 ? '+' : ''}${fmt(kpis.diferenciaGlobal)}`} hint="Oficial - RRV" tone={Math.abs(kpis.diferenciaGlobal) > 300 ? 'red' : 'gold'} />
        <Kpi icon="◌" label="Participación" value={`${kpis.participacion.toFixed(2)}%`} hint="sobre habilitados" tone="purple" />
        <Kpi icon="!" label="Inconsistencias" value={fmt(kpis.inconsistencias)} hint="campo por campo" tone="red" />
        <Kpi icon="★" label="Ganador oficial" value={kpis.ganador} hint={`margen ${fmt(kpis.margenVictoria)}`} tone="blue" />
      </section>
      <section className="heroGrid">
        <Card className="wide"><h2>Comparación nacional por partido</h2><CompareBars data={compare} /></Card>
        <Card><h2>Voto oficial</h2><Donut total={kpis.oficial.totalVotos} validos={kpis.oficial.votosValidos} blancos={kpis.oficial.votosBlancos} nulos={kpis.oficial.votosNulos} /></Card>
      </section>
      <section className="heroGrid">
        <Card><h2>Recepción RRV por hora</h2><LineMini data={timeline} /></Card>
        <Card className="wide"><CandidateResultsTable rows={compare} /></Card>
      </section>
      <section className="heroGrid">
        <Card><h2>Diferencia territorial</h2><HeatMap rows={deps.slice(0, 9)} /></Card>
        <Card className="wide"><TerritoryResultsTable rows={deps.slice(0, 12)} /></Card>
      </section>
      <section className="heroGrid">
        <Card><h2>Fuente de actas RRV</h2><SourceMatrix rows={source} /></Card>
        <Card className="wide"><TechnicalNotesPanel rows={technical} /></Card>
      </section>
      <section className="heroGrid single">
        <Card className="wide"><TableInconsistencias rows={inconsistencias.slice(0, 8)} /></Card>
      </section>
    </>
  );
}

function CompareBars({ data }) {
  const max = Math.max(...data.flatMap((r) => [r.rrv, r.oficial]), 1);
  return <div className="compareBars">{data.map((row) => <div className="compareRow" key={row.key}>
    <div><strong>{row.name}</strong><span>{row.diff >= 0 ? '+' : ''}{fmt(row.diff)} votos</span></div>
    <div className="barStack">
      <div className="barLine rrv" style={{ width: `${clamp((row.rrv * 100) / max, 6, 100)}%` }}><span>RRV {fmt(row.rrv)}</span></div>
      <div className="barLine oficial" style={{ width: `${clamp((row.oficial * 100) / max, 6, 100)}%` }}><span>Oficial {fmt(row.oficial)}</span></div>
    </div>
    <strong className={Math.abs(row.diffPct) > 1 ? 'dangerText' : 'okText'}>{row.diffPct.toFixed(2)}%</strong>
  </div>)}</div>;
}

function Donut({ total, validos, blancos, nulos }) {
  const safe = total || 1;
  const a = (validos * 100) / safe;
  const b = (blancos * 100) / safe;
  const c = (nulos * 100) / safe;
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
  return <div className="heatMap">{rows.map((r) => <div className="heatCell" key={r.departamento} style={{ '--heat': Math.abs(r.diff) / max }}>
    <strong>{r.departamento}</strong>
    <span>{r.diff >= 0 ? '+' : ''}{fmt(r.diff)}</span>
    <small>{r.actasOficial}/{r.actasRRV} actas · participación {r.participacion.toFixed(1)}%</small>
  </div>)}</div>;
}

function sourceSummary(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.origen || 'SIN_ORIGEN';
    const current = map.get(key) || { origen: key, total: 0, aplanadas: 0, revision: 0 };
    current.total += 1;
    if (r.pdfAplanado) current.aplanadas += 1;
    if (String(r.estado).includes('REVISION')) current.revision += 1;
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

function SourceMatrix({ rows }) {
  return <div className="sourceMatrix">{rows.map((r) => <div className="sourceCard" key={r.origen}>
    <strong>{r.origen}</strong>
    <span>{fmt(r.total)}</span>
    <small>{r.aplanadas ? `${r.aplanadas} PDF aplanados` : 'sin aplanado propio'}</small>
    <small>{r.revision} en revisión</small>
  </div>)}</div>;
}

function technicalSummary(oficialRows, rrvRows) {
  const merged = new Map();
  for (const a of [...oficialRows, ...rrvRows]) {
    const note = String(a.observacionTecnica || '').trim();
    if (!note) continue;
    const key = String(a.codigoActa);
    if (!merged.has(key)) {
      const upper = note.toUpperCase();
      const tipo = upper.includes('APLANADO') ? 'PDF aplanado'
        : upper.includes('RECORTADO') ? 'PDF recortado'
        : upper.includes('A0') || upper.includes('A4') ? 'Cambio de formato'
        : upper.includes('NULO') || upper.includes('BLANCO') ? 'Nulos/Blancos'
        : upper.includes('DUP') || upper.includes('CUDR') ? 'Duplicado'
        : upper.includes('NO EXIST') ? 'Mesa inexistente'
        : 'Nota técnica';
      merged.set(key, { codigoActa: key, mesa: a.nroMesa, departamento: a.departamento, tipo, nota: note });
    }
  }
  return [...merged.values()].slice(0, 12);
}

function TechnicalNotesPanel({ rows }) {
  return <div>
    <div className="tableHeader"><h2>Observaciones técnicas del acta</h2><span>Campo informativo; la detección viene de OCR/RRV o CSV</span></div>
    {!rows.length ? <div className="emptyState">No hay observaciones técnicas en el filtro actual.</div> : <div className="techList">{rows.map((r) => <div className="techItem" key={r.codigoActa}>
      <div><Pill tone={r.tipo.includes('aplanado') ? 'warning' : r.tipo.includes('recortado') || r.tipo.includes('formato') ? 'danger' : 'neutral'}>{r.tipo}</Pill><strong>Acta {r.codigoActa}</strong><small>{r.departamento} · mesa {r.mesa}</small></div>
      <p>{r.nota}</p>
    </div>)}</div>}
  </div>;
}

function Formulario({ oficial, onSave, backendStatus, onCheckBackend }) {
  const [selected, setSelected] = useState(oficial[0]?.codigoActa || '');
  const base = oficial.find((a) => String(a.codigoActa) === String(selected)) || oficial[0];
  const [form, setForm] = useState(() => toForm(base));
  const [result, setResult] = useState(null);

  useEffect(() => { setForm(toForm(base)); setResult(null); }, [selected]);
  const validation = useMemo(() => validateOfficialForm(form, oficial), [form, oficial]);
  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const save = async () => {
    const hardErrors = validation.issues.filter((issue) => issue.type === 'ERROR');
    if (hardErrors.length) {
      setResult({
        ok: false,
        text: 'No se puede guardar el acta porque tiene errores de validación.',
        response: hardErrors.map((issue) => issue.text),
      });
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
        setResult({ ok: true, text: 'Acta validada y enviada al servicio oficial configurado.', response });
      } catch (e) {
        setResult({ ok: false, text: 'Acta validada localmente, pero el servicio oficial no respondió.', response: e.body || e.message });
      }
    } else {
      setResult({ ok: true, text: 'Acta validada en modo demostración. El payload queda listo para integración con el servicio oficial.', response: validation.backendPayload });
    }
  };

  return <>
    <PageHeader eyebrow="Cómputo oficial" title="Formulario Oficial" subtitle="Captura y validación visual antes de enviar a PostgreSQL oficial.">
      <button className="ghost" onClick={onCheckBackend}>Comprobar backend</button>
      <button className="primary" onClick={save}>Guardar acta</button>
    </PageHeader>
    <Card className="formTop glass">
      <label><span>Acta base de prueba</span><select value={selected} onChange={(e) => setSelected(e.target.value)}>{oficial.slice(0, 140).map((a) => <option key={a.codigoActa} value={a.codigoActa}>Acta {a.nroActa} · Mesa {a.nroMesa} · {a.recinto}</option>)}</select></label>
      <Pill tone={validation.estadoVisual === 'RECHAZADA' ? 'danger' : validation.estadoVisual === 'OBSERVADA' ? 'warning' : 'ok'}>Payload oficial listo</Pill>
      <Pill tone={backendStatus.ok ? 'ok' : 'neutral'}>{backendStatus.ok ? 'Servicio oficial disponible' : 'Modo demostración'}</Pill>
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
      <Card className="formPanel span2"><h2>Observaciones, nota técnica y respuesta</h2>
        <div className="fields grid2">
          <label><span>Observación oficial</span><textarea value={form.observaciones || ''} onChange={(e) => update('observaciones', e.target.value)} placeholder="Observación del acta, si corresponde..." /></label>
          <label><span>Observación técnica opcional</span><textarea value={form.observacionTecnica || ''} onChange={(e) => update('observacionTecnica', e.target.value)} placeholder="Ej.: Aplanado ***, recortado, cambio A4/A0, duplicado..." /></label>
        </div>
        <p className="helperText">La observación técnica es informativa. El formulario la muestra para trazabilidad, pero no procesa PDF ni OCR.</p>
        {result && <div className={`resultBox ${result.ok ? 'ok' : 'error'}`}><strong>{result.text}</strong><pre>{JSON.stringify(result.response, null, 2)}</pre></div>}
      </Card>
    </section>
  </>;
}

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

function onlyDigits(value) {
  return String(value ?? '').replace(/[^0-9]/g, '');
}

function cleanText(value) {
  return String(value ?? '').replace(/[<>\{\}\[\]$;`]/g, '');
}

function Input({ label, value, onChange, text = false }) {
  if (text) {
    return <label><span>{label}</span><input type="text" value={value ?? ''} onChange={(e) => onChange(cleanText(e.target.value))} /></label>;
  }
  return (
    <label>
      <span>{label}</span>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value ?? ''}
        onChange={(e) => {
          const digits = onlyDigits(e.target.value);
          onChange(digits === '' ? '' : Number(digits));
        }}
        onKeyDown={(e) => {
          const allowed = ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
          const isShortcut = e.ctrlKey || e.metaKey;
          if (allowed.includes(e.key) || isShortcut) return;
          if (!/^[0-9]$/.test(e.key)) e.preventDefault();
        }}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData('text');
          if (/[^0-9]/.test(pasted)) e.preventDefault();
        }}
      />
    </label>
  );
}

function ActasPage({ oficial }) {
  const [filters, setFilters] = useState({ proceso: 'Elecciones Subnacionales 2026', departamento: '', provincia: '', municipio: '', recinto: '', mesa: '', estado: '', fuente: '', q: '' });
  const rows = useMemo(() => filterActas(oficial, filters), [oficial, filters]);
  return <>
    <PageHeader eyebrow="Cómputo oficial" title="Actas Oficiales" subtitle="Listado visual del registro oficial preparado para PostgreSQL.">
      <button className="primary" onClick={() => exportJson('actas-oficiales-front.json', rows)}>Exportar</button>
    </PageHeader>
    <Filters filters={filters} setFilters={setFilters} data={oficial} title="Filtro de actas oficiales" />
    <Card><div className="tableHeader"><h2>{fmt(rows.length)} actas</h2><span>Vista frontend; la persistencia real corresponde al PostgreSQL oficial.</span></div><ResponsiveTable rows={rows.slice(0, 80)} /></Card>
  </>;
}

function ResponsiveTable({ rows }) {
  return <div className="tableWrap"><table><thead><tr><th>Acta</th><th>Mesa</th><th>Departamento</th><th>Municipio</th><th>Recinto</th><th>Total</th><th>Estado</th><th>Nota técnica</th></tr></thead><tbody>{rows.map((a) => <tr key={a.codigoActa}><td><b>{a.nroActa}</b></td><td>{a.nroMesa}</td><td>{a.departamento}</td><td>{a.municipio}</td><td>{a.recinto}</td><td>{fmt(a.totalVotos)}</td><td><Pill tone={String(a.estado).includes('OBS') ? 'warning' : 'ok'}>{a.estado}</Pill></td><td>{a.observacionTecnica ? <Pill tone="warning">Sí</Pill> : <span className="mutedText">—</span>}</td></tr>)}</tbody></table></div>;
}

function InconsistenciasPage({ oficial }) {
  const rows = useMemo(() => buildInconsistencias(oficial, rrvActas), [oficial]);
  return <>
    <PageHeader eyebrow="Comparación" title="Inconsistencias RRV vs Oficial" subtitle="Diferencias campo por campo entre el documento RRV y el acta oficial.">
      <button className="primary" onClick={() => exportJson('inconsistencias-rrv-oficial.json', rows)}>Exportar</button>
    </PageHeader>
    <Card><TableInconsistencias rows={rows.slice(0, 120)} full /></Card>
  </>;
}

function TableInconsistencias({ rows, full = false }) {
  return <><div className="tableHeader"><h2>Inconsistencias detectadas</h2><span>{rows.length} registros visibles</span></div><div className="tableWrap"><table><thead><tr><th>Acta</th><th>Mesa</th><th>Departamento</th>{full && <th>Recinto</th>}<th>Campo</th><th>RRV</th><th>Oficial</th><th>Diff</th><th>Criticidad</th><th>Origen RRV</th>{full && <th>Nota técnica</th>}</tr></thead><tbody>{rows.map((r, idx) => <tr key={`${r.codigoActa}-${r.campo}-${idx}`}><td><b>{r.codigoActa}</b></td><td>{r.nroMesa}</td><td>{r.departamento}</td>{full && <td>{r.recinto}</td>}<td>{r.campo}</td><td>{fmt(r.rrv)}</td><td>{fmt(r.oficial)}</td><td className={Math.abs(r.diff) >= 8 ? 'dangerText' : 'goldText'}>{r.diff >= 0 ? '+' : ''}{fmt(r.diff)}</td><td><Pill tone={r.criticidad === 'ALTA' ? 'danger' : r.criticidad === 'MEDIA' ? 'warning' : 'neutral'}>{r.criticidad}</Pill></td><td>{r.origenRRV}</td>{full && <td>{r.observacionTecnica ? <Pill tone="warning">{r.observacionTecnica}</Pill> : <span className="mutedText">—</span>}</td>}</tr>)}</tbody></table></div></>;
}

function AuditoriaPage({ oficial, backendStatus }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const localLogs = useMemo(() => oficial.slice(0, 20).map((a, i) => ({ id: `LOCAL-${i}`, fecha: a.fechaRegistro, accion: a.estado === 'OBSERVADO' ? 'OBSERVACION_FRONT' : 'VALIDACION_FRONT', detalle: `Acta ${a.nroActa} revisada visualmente`, usuario: 'Frontend' })), [oficial]);
  const load = async () => {
    setLoading(true);
    try { setLogs(await getAuditoriaOficial(80)); } catch { setLogs([]); }
    setLoading(false);
  };
  return <>
    <PageHeader eyebrow="Trazabilidad" title="Auditoría" subtitle="Vista para revisar acciones del frontend y auditoría real del servicio oficial cuando esté disponible.">
      <button className="primary" onClick={load}>{loading ? 'Cargando...' : 'Cargar auditoría backend'}</button>
    </PageHeader>
    <section className="heroGrid"><Card><h2>Estado</h2><p className="muted">Backend oficial: <b>{backendStatus.ok ? 'conectado' : 'no conectado'}</b></p><p className="muted">Si el servicio oficial no está disponible, esta pantalla muestra auditoría local de demostración.</p></Card><Card className="wide"><h2>Eventos</h2><div className="timeline">{(logs.length ? logs : localLogs).map((log, idx) => <div className="timeItem" key={log.id_auditoria || log.id || idx}><span>{String(log.fecha_accion || log.fecha || '').replace('T',' ').slice(0, 19)}</span><strong>{log.accion}</strong><p>{log.detalle || log.valor_nuevo || 'Sin detalle'}</p></div>)}</div></Card></section>
  </>;
}

function IntegracionPage({ backendStatus, onCheckBackend }) {
  return <>
    <PageHeader eyebrow="Documentación técnica" title="Integración con las bases de datos del equipo" subtitle="Este frontend no crea bases propias: consume PostgreSQL oficial y RRV MongoDB cuando esos servicios estén disponibles.">
      <button className="primary" onClick={onCheckBackend}>Probar backend oficial</button>
    </PageHeader>
    <section className="architecture">
      <Card><h2>Base oficial PostgreSQL</h2><img src="/diagrama-postgresql-oficial.png" alt="Diagrama PostgreSQL oficial" /><p>Usada por el Formulario Oficial mediante los endpoints del backend oficial. Tablas principales: acta_oficial, voto_oficial, auditoria_voto, mesa_electoral.</p></Card>
      <Card><h2>Base RRV MongoDB</h2><img src="/diagrama-mongodb-rrv.png" alt="Diagrama MongoDB RRV" /><p>Usada por el Dashboard Comparativo. En los ZIP actuales no aparece el backend/cluster Mongo completo, por eso el frontend trae mock reemplazable.</p></Card>
    </section>
    <section className="heroGrid">
      <Card><h2>Endpoints esperados</h2><EndpointList /></Card>
      <Card><h2>Qué hace mi parte</h2><ul className="prettyList"><li>Formulario oficial visual y validado.</li><li>Payload compatible con <code>POST /api/oficial/actas</code>.</li><li>Dashboard comparativo RRV vs Oficial.</li><li>Inconsistencias campo por campo.</li><li>Auditoría visual y preparada para backend.</li></ul></Card>
      <Card><h2>Qué no hace mi parte</h2><ul className="prettyList"><li>No implementa OCR ni aplanado de PDF.</li><li>No implementa SMS ni app móvil.</li><li>No crea PostgreSQL Cluster ni MongoDB Cluster.</li><li>No hace n8n ni Selenium.</li><li>No reemplaza el backend oficial ni el backend RRV del equipo.</li></ul></Card>
    </section>
    <Card><h2>Configuración detectada</h2><pre className="codeBlock">{JSON.stringify({ backendStatus, apiInfo }, null, 2)}</pre></Card>
  </>;
}

function EndpointList() {
  const entries = Object.entries(apiInfo.endpoints);
  return <div className="endpointList">{entries.map(([k, v]) => <div key={k}><span>{k}</span><code>{v}</code></div>)}</div>;
}
