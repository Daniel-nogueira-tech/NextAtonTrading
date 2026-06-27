import { useState } from 'react'
import './App.css'
import { Route, Routes, useLocation } from 'react-router-dom'
import Home from './Pages/Home'
import OperatingPanel from './Components/OperatingPanel/OperatingPanel'
import Login from './Components/Login/Login'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <div>
        <Routes>
          <Route path="/" element={<Home />} />   
          <Route path="/OperatingPanel" element={<OperatingPanel />} />
          <Route path="/Login" element={<Login />} />
        </Routes>
      </div>
    </>
  )
}

export default App
