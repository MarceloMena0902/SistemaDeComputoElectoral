// src/App.jsx
import { useEffect, useState } from 'react'
import Sidebar, { NAV } from './components/Sidebar'
import Header from './components/Header'
import TweaksPanel from './components/TweaksPanel'
import Dashboard from './pages/Dashboard'
import CamaraPage from './pages/CamaraPage'
import { departments } from './data/rrv'
import {
  ActasPage,
  DeptPage,
  InicioPage,
  MapaPage,
  PipelinePage,
  TransparenciaPage,
} from './pages/OperationalPages'
import { initializeData } from './data/rrv'

const viewMeta = {
  inicio: {
    title: 'Sistema electoral',
    eyebrow: 'distribuido',
    subtitle: 'RRV, computo oficial, SMS y trazabilidad en una sola consola',
  },
  dashboard: {
    title: 'Dashboard',
    eyebrow: 'en vivo',
    subtitle: 'Recuento Rapido de Votos - datos preliminares NO oficiales',
  },
  mapa: {
    title: 'por ciudad',
    eyebrow: 'Mapa',
    eyebrowFirst: true,
    titleAccent: '#3B82F6',
    subtitle: 'Bolivia - 9 departamentos - resultados preliminares',
  },
  actas: {
    title: 'recibidas',
    eyebrow: 'Actas',
    eyebrowFirst: true,
    titleAccent: '#3B82F6',
    subtitle: 'Stream en vivo desde recintos - OCR + SMS',
  },
  camara: {
    title: 'Capturar Acta',
    eyebrow: 'Cámara',
    eyebrowFirst: true,
    titleAccent: '#10B981',
    subtitle: 'Toma una foto del acta electoral para procesarla',
  },
  dept: {
    title: '',
    eyebrow: 'La Paz',
    eyebrowFirst: true,
    titleAccent: '#3B82F6',
    subtitle: 'Detalle por departamento - analisis profundo',
  },
  pipeline: {
    title: 'Arquitectura',
    eyebrow: 'CQRS',
    subtitle: 'Eventos, reintentos, workers asincronos y read models',
  },
  transp: {
    title: 'Transparencia',
    eyebrow: 'auditable',
    subtitle: 'Trazabilidad, actas publicadas e inconsistencias detectadas',
  },
}

function getHashView() {
  const raw = window.location.hash.replace('#', '').split('?')[0]
  return NAV.some(item => item.id === raw) ? raw : 'dashboard'
}

function getHashDept() {
  const raw = window.location.hash.replace('#', '')
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : ''
  const params = new URLSearchParams(query)
  const id = params.get('id') || params.get('dept')
  return departments.find(d => d.id === id) || departments[0]
}

export default function App() {
  const [theme, setThemeState] = useState(() => localStorage.getItem('rrv-theme') || 'dark')
  const [accent, setAccent] = useState(() => localStorage.getItem('rrv-accent') || '#D4A574')
  const [tweaksOpen, setTweaksOpen] = useState(false)
  const [activeView, setActiveView] = useState(getHashView)
  const [locationHash, setLocationHash] = useState(() => window.location.hash)
  const [dataLoaded, setDataLoaded] = useState(false)

  const setTheme = t => {
    setThemeState(t)
    document.documentElement.setAttribute('data-theme', t)
    localStorage.setItem('rrv-theme', t)
  }

  useEffect(() => {
    const loadData = async () => {
      console.log('🚀 Inicializando datos desde el backend...')
      await initializeData()
      setDataLoaded(true)
      console.log('✅ Datos cargados correctamente')
    }
    loadData()
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.style.setProperty('--accent', accent)
  }, [theme, accent])

  useEffect(() => {
    const onHashChange = () => {
      setActiveView(getHashView())
      setLocationHash(window.location.hash)
    }
    window.addEventListener('hashchange', onHashChange)
    if (!window.location.hash) window.history.replaceState(null, '', '#dashboard')
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const headerMeta = () => {
    if (activeView === 'dept') {
      const dept = getHashDept()
      return {
        ...viewMeta.dept,
        eyebrow: dept?.name || 'Departamento',
        subtitle: `Detalle por departamento - analisis profundo`,
      }
    }
    return viewMeta[activeView] || viewMeta.dashboard
  }

  const page = () => {
    if (!dataLoaded) {
      return (
        <div className="loading-screen" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <div style={{ textAlign: 'center' }}>
            <h2>Cargando datos electorales...</h2>
            <p>Conectando con el servidor...</p>
          </div>
        </div>
      )
    }
    
    const views = {
      inicio: <InicioPage />,
      dashboard: <Dashboard />,
      mapa: <MapaPage />,
      actas: <ActasPage />,
      camara: <CamaraPage />,
      dept: <DeptPage key={locationHash} />,
      pipeline: <PipelinePage />,
      transp: <TransparenciaPage />,
    }
    return views[activeView] || views.dashboard
  }

  return (
    <div className="app-shell">
      <Sidebar activeView={activeView} />
      <main className="main">
        <Header
          theme={theme}
          setTheme={setTheme}
          onTweaksToggle={() => setTweaksOpen(open => !open)}
          {...headerMeta()}
        />
        <div className="view-shell">
          {page()}
        </div>
      </main>
      <TweaksPanel
        visible={tweaksOpen}
        theme={theme}
        setTheme={setTheme}
        accent={accent}
        setAccent={setAccent}
      />
    </div>
  )
}