import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { SettingsPage } from './components/SettingsPage';
import './styles.css';

const settingsView =
  new URLSearchParams(window.location.search).get('view') === 'settings';
if (settingsView) document.title = 'Persona Settings';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {settingsView ? <SettingsPage /> : <App />}
  </StrictMode>,
);
