export default function TweaksPanel({ visible, theme, setTheme, accent, setAccent }) {
  const accents = [
    { value: '#D4A574', label: 'Oro editorial' },
    { value: '#3B82F6', label: 'Azul institucional' },
    { value: '#10B981', label: 'Verde lima' },
    { value: '#F472B6', label: 'Rosa' },
    { value: '#EAB308', label: 'Ámbar' },
  ]

  const handleAccent = (v) => {
    setAccent(v)
    document.documentElement.style.setProperty('--accent', v)
    localStorage.setItem('rrv-accent', v)
  }

  return (
    <div className={`tweaks-panel${visible ? ' visible' : ''}`}>
      <h4>Tweaks</h4>
      <div className="tweaks-row">
        <label>Tema</label>
        <select value={theme} onChange={e => setTheme(e.target.value)}>
          <option value="dark">Oscuro</option>
          <option value="light">Claro</option>
        </select>
      </div>
      <div className="tweaks-row">
        <label>Acento</label>
        <select value={accent} onChange={e => handleAccent(e.target.value)}>
          {accents.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </div>
      <div className="tweaks-row">
        <label>Densidad</label>
        <select defaultValue="comfy">
          <option value="comfy">Cómoda</option>
          <option value="compact">Compacta</option>
        </select>
      </div>
      <div className="tweaks-row">
        <label>Animaciones GSAP</label>
        <select defaultValue="full">
          <option value="full">Completas</option>
          <option value="subtle">Sutiles</option>
          <option value="off">Desactivadas</option>
        </select>
      </div>
    </div>
  )
}
