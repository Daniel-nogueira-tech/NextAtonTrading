import { lazy, Suspense } from 'react'
import './Home.css'
import NavBar from '../Components/NavBar/NavBar'

const GraphicsRenko = lazy(() => import('../Components/GraphicsRenko/GraphicsRenko'))

const Home = () => {
  return (
    <div>
        <div>
            <NavBar/>
            <Suspense fallback={<div role="status">Carregando gráfico...</div>}>
              <GraphicsRenko />
            </Suspense>
        </div>
    </div>
  )
}

export default Home