/**
 * Error Boundary - Hotfix S1
 * Catches React errors and displays friendly fallback UI
 */

import { Component, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '400px',
            padding: '32px',
            background: '#fef2f2',
            borderRadius: '12px',
            border: '2px solid #fecaca',
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px', color: '#111827' }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px', textAlign: 'center', maxWidth: '400px' }}>
            An unexpected error occurred. Try refreshing the page or contact support if the problem persists.
          </p>
          {this.state.error && (
            <details style={{ marginBottom: '16px', fontSize: '12px', color: '#6b7280' }}>
              <summary style={{ cursor: 'pointer', marginBottom: '8px' }}>Error details</summary>
              <pre style={{ background: '#fff', padding: '12px', borderRadius: '4px', overflow: 'auto', maxWidth: '600px' }}>
                {this.state.error.toString()}
                {this.state.error.stack}
              </pre>
            </details>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
