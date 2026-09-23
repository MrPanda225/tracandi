// Self-hosted fonts: no request to a third-party font service. Only the weight axis is loaded here (36 kB instead
// of 121 kB for the latin subset); the login page adds the SOFT and WONK axes it alone uses (ENF-PERF-01).
import '@fontsource-variable/fraunces/wght.css';
import '@fontsource-variable/fraunces/wght-italic.css';
import '@fontsource-variable/manrope';
import './styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ROUTER_FUTURE } from './lib/router';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter future={ROUTER_FUTURE}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
