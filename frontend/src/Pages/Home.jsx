import React from 'react'
import './Home.css'
import GraphicsRenko from '../Components/GraphicsRenko/GraphicsRenko'
import NavBar from '../Components/NavBar/NavBar'

const Home = () => {
  return (
    <div>
        <div>
            <NavBar/>
            <GraphicsRenko />
        </div>
    </div>
  )
}

export default Home