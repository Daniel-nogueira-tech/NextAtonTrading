import { lazy, Suspense } from 'react'
import './App.css'
import { Route, Routes } from 'react-router-dom'

const Home = lazy(() => import('./Pages/Home'))
const OperatingPanel = lazy(() => import('./Components/OperatingPanel/OperatingPanel'))
const Login = lazy(() => import('./Components/Login/Login'))

function App() {
  return (
    <Suspense fallback={<div role="status">Carregando...</div>}>
      <div>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/OperatingPanel" element={<OperatingPanel />} />
          <Route path="/Login" element={<Login />} />
        </Routes>
      </div>
    </Suspense>
  )
}

export default App
