import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from '@/app/App';
import { startAuthSession } from '@/features/auth/session-store';
import { requestPersistentStorage } from '@/pwa/storage';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import '@/styles/index.css';

void requestPersistentStorage();
startAuthSession();
document.documentElement.dataset.build = __BUILD_ID__;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
