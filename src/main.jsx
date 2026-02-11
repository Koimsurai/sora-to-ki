import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import './index.css';
import App from './App.jsx';

const root = createRoot(document.getElementById('root'));

// StrictMode disabled for better performance
root.render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
