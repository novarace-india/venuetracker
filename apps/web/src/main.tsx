import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Scanner } from './Scanner';
import './styles.css';
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="login">
        <h1>NovaRace Flow needs a refresh</h1>
        <p>Your queued scans remain on this device.</p>
        <button onClick={() => location.reload()}>Reload</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      {location.pathname.startsWith('/scanner') ? <Scanner /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>,
);
