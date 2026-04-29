import { actas, estadoColores } from '../data/rrv'

export default function ActasStream() {
  return (
    <div className="stream-list">
      {actas.map(a => {
        const e = estadoColores[a.estado] || { bg: '#E5E7EB', fg: '#374151' }
        return (
          <div key={a.id} className="stream-row">
            <span className="id">{a.id}</span>
            <span className="recinto">
              {a.recinto}
              <small>{a.ciudad.toUpperCase()} · {a.mesa}</small>
            </span>
            <span className="estado" style={{ background: e.bg, color: e.fg }}>
              {a.estado}
            </span>
            <span className="conf">{a.conf != null ? a.conf.toFixed(0) + '%' : '—'}</span>
            <span className="hora">{a.hora}</span>
          </div>
        )
      })}
    </div>
  )
}
