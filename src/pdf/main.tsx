import React from 'react';
import ReactDOM from 'react-dom/client';
import { PdfViewerApp } from './PdfViewerApp';
import '../styles/pdf-viewer.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <PdfViewerApp />
    </React.StrictMode>
  );
}
