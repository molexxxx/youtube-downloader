import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { MiniApp } from './components/mini/MiniApp'
import './styles/globals.css'

// The pinned quick-actions window loads the same bundle with '#mini'.
const isMini = window.location.hash.replace(/^#\/?/, '') === 'mini'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>{isMini ? <MiniApp /> : <App />}</React.StrictMode>
)
