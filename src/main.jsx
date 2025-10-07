import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

const root = createRoot(document.getElementById('root'));

// StrictMode disabled for better performance
root.render(<App />);
