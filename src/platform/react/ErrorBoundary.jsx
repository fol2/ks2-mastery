import { Component } from 'react';
import { isChunkLoadError } from './chunk-load-detect.js';
import { clearChunkReloadAttempt, scheduleChunkReloadOnce } from './chunk-load-recovery.js';

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

// U7 hardening-residuals: chunk-load-specific fallback with a reload CTA.
// When a React.lazy() chunk fails to load, the user sees a clear "Reload"
// button instead of a generic error message. The reload refetches all
// chunks from the server, which resolves the stale-deploy scenario.
export function ChunkLoadErrorFallback() {
  return (
    <section className="card" role="alert" aria-live="polite">
      <div className="feedback warn">
        <strong>This section failed to load</strong>
        <div className="error-boundary-body">
          A code update may have been deployed while you were using the app.
          Reload the page to get the latest version.
        </div>
        <div className="actions error-boundary-reload-actions">
          <button
            className="btn primary"
            type="button"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    </section>
  );
}

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    clearChunkReloadAttempt();
    this.state = { error: null, isChunkError: false };
  }

  static getDerivedStateFromError(error) {
    return { error, isChunkError: isChunkLoadError(error) };
  }

  componentDidCatch(error, info) {
    this.props.onError?.(error, info);
    scheduleChunkReloadOnce(error);
  }

  render() {
    if (this.state.error) {
      // U7: chunk-load errors get a dedicated reload CTA so the user
      // can recover from stale-deploy chunk mismatches with one click.
      if (this.state.isChunkError) {
        return <ChunkLoadErrorFallback />;
      }
      return this.props.fallback || <DefaultErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}
