import React from 'react';
import { SubjectBreadcrumb } from '../shell/SubjectBreadcrumb.jsx';
import { SubjectRouteContext } from './SubjectRouteContext.js';
import { SubjectRuntimeFallback } from './SubjectRuntimeFallback.jsx';
import { PunctuationPracticeSurface } from '../../subjects/punctuation/components/PunctuationPracticeSurface.jsx';
import { SpellingPracticeSurface } from '../../subjects/spelling/components/SpellingPracticeSurface.jsx';
import { isSubjectExposed } from '../../platform/core/subject-availability.js';

const REACT_SUBJECT_COMPONENTS = Object.freeze({
  punctuation: PunctuationPracticeSurface,
  spelling: SpellingPracticeSurface,
});

function selectedLearner(appState) {
  const learnerId = appState?.learners?.selectedId || '';
  return learnerId ? appState.learners?.byId?.[learnerId] || null : null;
}

function NoWritableLearnerCard({ subject, context, actions }) {
  const detail = context?.shellAccess?.source === 'worker-session'
    ? 'This signed-in shell still bootstraps writable learners only. Read-only viewer learners stay available through Parent Hub or Admin / Operations.'
    : 'Create or select a learner to continue.';
  const openParentHub = () => {
    if (typeof actions.openParentHub === 'function') {
      actions.openParentHub();
      return;
    }
    actions.dispatch?.('open-parent-hub');
  };
  const openAdminHub = () => {
    if (typeof actions.openAdminHub === 'function') {
      actions.openAdminHub();
      return;
    }
    actions.dispatch?.('open-admin-hub');
  };

  return (
    <section className="card">
      <div className="feedback warn">
        <strong>{subject.name} stays unavailable without a writable learner in the main shell</strong>
        <div style={{ marginTop: 8 }}>{detail}</div>
      </div>
      <div className="actions" style={{ marginTop: 16 }}>
        <button className="btn secondary" type="button" onClick={openParentHub}>Parent Hub</button>
        <button className="btn secondary" type="button" onClick={openAdminHub}>Operations</button>
        <button className="btn ghost" type="button" onClick={actions.navigateHome}>Dashboard</button>
      </div>
    </section>
  );
}

function SubjectUnavailableCard({ subject, actions }) {
  return (
    <section className="card">
      <div className="feedback warn">
        <strong>{subject.name} is not available in this deployment yet</strong>
        <div style={{ marginTop: 8 }}>It will appear once the final release checks are complete.</div>
      </div>
      <div className="actions" style={{ marginTop: 16 }}>
        <button className="btn ghost" type="button" onClick={actions.navigateHome}>Dashboard</button>
      </div>
    </section>
  );
}

class SubjectRenderBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { runtimeEntry: null };
  }

  componentDidCatch(error) {
    const runtimeEntry = this.props.captureRenderError(error, this.props.methodName, { returnEntry: true });
    this.setState({ runtimeEntry });
  }

  render() {
    if (this.state.runtimeEntry) {
      return (
        <SubjectRuntimeFallback
          subject={this.props.subject}
          runtimeEntry={this.state.runtimeEntry}
          activeTab={this.props.activeTab}
          onRetry={this.props.onRetry}
        />
      );
    }
    return this.props.children;
  }
}

function renderPracticeNode({ subject, routeContext, actions, activeTab, runtimeEntry, captureRenderError }) {
  if (runtimeEntry) {
    return (
      <SubjectRuntimeFallback
        subject={subject}
        runtimeEntry={runtimeEntry}
        activeTab={activeTab}
        onRetry={() => actions.dispatch?.('subject-runtime-retry')}
      />
    );
  }

  if (typeof subject.renderPracticeComponent === 'function') {
    try {
      return subject.renderPracticeComponent(routeContext);
    } catch (error) {
      return captureRenderError(error, 'renderPracticeComponent');
    }
  }

  const PracticeComponent = subject.PracticeComponent || REACT_SUBJECT_COMPONENTS[subject.id];
  if (typeof PracticeComponent === 'function') {
    return (
      <SubjectRenderBoundary
        subject={subject}
        activeTab={activeTab}
        methodName="PracticeComponent"
        onRetry={() => actions.dispatch?.('subject-runtime-retry')}
        captureRenderError={captureRenderError}
      >
        <PracticeComponent {...routeContext} actions={actions} />
      </SubjectRenderBoundary>
    );
  }

  return captureRenderError(
    new Error(`${subject.id} does not expose a React practice component.`),
    'PracticeComponent',
  );
}

export function SubjectRoute({ appState, context, actions }) {
  const subject = context.subject;
  const learner = selectedLearner(appState);
  const activeTab = 'practice';
  const routeContext = { ...context, subject, service: context.services?.[subject.id] || context.service || null };
  const runtimeEntry = context.runtimeBoundary?.read?.({
    learnerId: appState.learners?.selectedId,
    subjectId: subject.id,
    tab: activeTab,
  });

  function captureRenderError(error, methodName, { returnEntry = false } = {}) {
    const captured = context.runtimeBoundary?.capture?.({
      learnerId: appState.learners?.selectedId,
      subject,
      tab: activeTab,
      phase: 'render',
      methodName,
      error,
    }) || {
      message: `${subject.name} could not render right now.`,
      debugMessage: error?.message || String(error),
      phase: 'render',
      methodName,
    };
    if (returnEntry) return captured;
    return (
      <SubjectRuntimeFallback
        subject={subject}
        runtimeEntry={captured}
        activeTab={activeTab}
        onRetry={() => actions.dispatch?.('subject-runtime-retry')}
      />
    );
  }

  if (!isSubjectExposed(subject, context.subjectExposureGates)) {
    return (
      <main className="subject-entry-content">
        <SubjectUnavailableCard subject={subject} actions={actions} />
      </main>
    );
  }

  if (!learner) {
    return (
      <main className="subject-entry-content">
        <NoWritableLearnerCard subject={subject} context={context} actions={actions} />
      </main>
    );
  }

  return (
    <SubjectRouteContext.Provider value={{ appState, context: routeContext, actions, subject, activeTab }}>
      <main className="subject-entry-content">
        <SubjectBreadcrumb subjectName={subject.name} onDashboard={actions.navigateHome} />
        {appState.subjectUi?.[subject.id]?.error ? (
          <section className="card" style={{ marginBottom: 18 }} role="alert" aria-live="polite">
            <div className="feedback bad">
              <strong>Subject message</strong>
              <div>{appState.subjectUi[subject.id].error}</div>
            </div>
          </section>
        ) : null}
        {renderPracticeNode({ subject, routeContext, actions, activeTab, runtimeEntry, captureRenderError })}
      </main>
    </SubjectRouteContext.Provider>
  );
}
