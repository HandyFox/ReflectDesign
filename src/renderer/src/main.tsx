import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import './styles.css'

createRoot(document.getElementById('root')!).render(<App />)

// Handy for debugging in the dev tools console.
if (import.meta.env.DEV) {
  import('@core/editor').then((m) => { (window as any).__editor = m.editor })
}
