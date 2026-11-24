import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { TemaProvider } from './context/TemaContext.jsx';
import { ValoresOcultosProvider } from './context/ValoresOcultosContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <TemaProvider>
      <ValoresOcultosProvider>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
      </ValoresOcultosProvider>
    </TemaProvider>
  </React.StrictMode>
);
