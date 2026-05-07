import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { HashRouter } from 'react-router-dom'
import { ContextGraphicsProvider } from './ContextGraphics/ContextGraphics.jsx'

createRoot(document.getElementById('root')).render(

  <ContextGraphicsProvider>
    <HashRouter>
      <StrictMode>
        <App />
      </StrictMode>
    </HashRouter>
  </ContextGraphicsProvider>
)
