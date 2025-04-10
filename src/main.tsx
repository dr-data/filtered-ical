import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Only render the React app if we're not on a calendar endpoint
const path = window.location.pathname;
const isCalendarEndpoint = path.includes('/calendar/') && path.endsWith('/filtered.ics');

if (!isCalendarEndpoint) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
