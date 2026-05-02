import { useEffect, useState } from 'react'

export default function Header({
  theme,
  setTheme,
  onTweaksToggle,
  title = 'Dashboard',
  eyebrow = 'en vivo',
  subtitle = 'Recuento Rapido de Votos - datos preliminares NO oficiales',
  eyebrowFirst = false,
  titleAccent,
}) {
  const [time, setTime] = useState('')

  useEffect(() => {
    const tick = () => {
      const t = new Date()
      const hh = String(t.getHours()).padStart(2, '0')
      const mm = String(t.getMinutes()).padStart(2, '0')
      const ss = String(t.getSeconds()).padStart(2, '0')
      setTime(`${hh}:${mm}:${ss}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="app-header">
      <div className="app-header__title">
        <h1>
          {eyebrowFirst
            ? <><em style={titleAccent ? { color: titleAccent } : undefined}>{eyebrow}</em> {title}</>
            : <>{title} <em style={titleAccent ? { color: titleAccent } : undefined}>{eyebrow}</em></>}
        </h1>
        <p>{subtitle}</p>
      </div>

      <div className="header-badges">
        <span className="badge badge--live">EN VIVO</span>
        <span className="badge badge--info">Actualizado - {time}</span>

        <div className="theme-toggle">
          <button
            data-theme-set="dark"
            className={theme === 'dark' ? 'active' : ''}
            title="Oscuro"
            onClick={() => setTheme('dark')}
          >●</button>
          <button
            data-theme-set="light"
            className={theme === 'light' ? 'active' : ''}
            title="Claro"
            onClick={() => setTheme('light')}
          >○</button>
        </div>

        <button className="btn btn--ghost" onClick={onTweaksToggle}
          style={{ padding: '8px 12px' }} title="Tweaks">⚙</button>
      </div>
    </header>
  )
}
