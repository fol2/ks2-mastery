import React from 'react';

export function DefaultErrorFallback({ error }) {
  // SH2-U8: inline style prop migrated to `.error-boundary-body` class
  // (see docs/hardening/csp-inline-style-inventory.md).
  return (
    <section className="card" role="alert" aria-live="polite">
      <div className="feedback bad">
        <strong>App surface temporarily unavailable</strong>
        <div className="error-boundary-body">
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
