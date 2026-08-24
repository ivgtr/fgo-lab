import './app/foundation.css';
import './ui/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';

const root = document.querySelector<HTMLDivElement>('#root');
if (!root) throw new Error('root_missing');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
if ('serviceWorker' in navigator && import.meta.env.PROD)
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
