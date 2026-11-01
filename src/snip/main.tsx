import React from 'react';
import ReactDOM from 'react-dom/client';
import { SnipApp } from './SnipApp';
import '../styles/pdf-viewer.css';
import '../styles/snip.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <SnipApp />
    </React.StrictMode>
  );
}

