import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import AuthGate from './components/AuthGate.jsx' // ojo: que coincida la ruta real
import './index.css'

const basename = import.meta.env.MODE === 'production' ? '/sitio-beesion' : '/'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthGate>
      <BrowserRouter basename={basename}>
        <App />
      </BrowserRouter>
    </AuthGate>
  </React.StrictMode>
)




