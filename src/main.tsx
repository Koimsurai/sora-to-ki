import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from './components/ui/sonner';
// TASA Orbiter（Latin 內文 / 數字 / 英文）+ TASA Explorer（display / wordmark）
// 由 localremote 設計、台灣太空中心 TASA 開源（SIL OFL）— variable font
import '@fontsource-variable/tasa-orbiter';
import '@fontsource-variable/tasa-explorer';
import './i18n'; // initialize i18next（detect localStorage > navigator > fallback zh-TW）
import './index.css';
import App from './App';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');
const root = createRoot(rootEl);

// StrictMode disabled for better performance
root.render(
  <HelmetProvider>
    <App />
    <Toaster position="bottom-right" />
  </HelmetProvider>
);
