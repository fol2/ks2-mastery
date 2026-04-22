import React from 'react';

export function DefaultErrorFallback({ error }) {
  return (
    <section className="card" role="alert" aria-live="polite">
      <div className="feedback bad">
        <strong>App surface temporarily unavailable</strong>
        <div style={{ marginTop: 8 }}>
          {error?.message || 'This route hit an unexpected rendering error.'}
        </div>
      </div>
    </section>
  );
}

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.props.onError?.(error, info);
  }

  render() {
    if (this.state.error) {
      return this.props.fallback || <DefaultErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}
