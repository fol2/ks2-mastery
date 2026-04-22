import React from 'react';

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
      return this.props.fallback || (
        <section className="card">
          <div className="feedback bad">
            <strong>App surface temporarily unavailable</strong>
            <div style={{ marginTop: 8 }}>
              {this.state.error?.message || 'This route hit an unexpected rendering error.'}
            </div>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}
