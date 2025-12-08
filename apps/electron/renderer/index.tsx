import React from 'react';
import { createRoot } from 'react-dom/client';
import { SystemProvider } from '@termai/ui-core';
import '@termai/ui-core/styles/index.css';
import App from './App';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

createRoot(root).render(
  <React.StrictMode>
    <SystemProvider>
      <App />
    </SystemProvider>
  </React.StrictMode>
);
