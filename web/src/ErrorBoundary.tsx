import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[BaseMail] React error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', padding: 40 }}>
          <h1 style={{ fontSize: '2rem', marginBottom: 16 }}>⚠️ Something went wrong</h1>
          <pre style={{ color: '#ff6b6b', fontSize: '0.8rem', maxWidth: 600, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {this.state.error.message}
          </pre>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{ marginTop: 20, background: '#0055ff', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontSize: '0.9rem' }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
