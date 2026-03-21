import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initTerminalBackend } from './lib/terminal-backend';
import './globals.css';

initTerminalBackend().then(() => {
  const root = createRoot(document.getElementById('root')!);
  root.render(<App />);
});
