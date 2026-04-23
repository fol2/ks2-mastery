import { createLocalPlatformRepositories } from '../../src/platform/core/repositories/index.js';
import { createSubjectRuntimeBoundary } from '../../src/platform/core/subject-runtime.js';
import { renderApp } from '../../src/platform/ui/render.js';
import { SUBJECTS } from '../../src/platform/core/subject-registry.js';
import { createAppController } from '../../src/platform/app/create-app-controller.js';
import { createNoopTtsPort } from '../../src/platform/app/side-effect-ports.js';
import { renderReactControllerApp } from './react-app-ssr.js';

export function makeTts() {
  return createNoopTtsPort();
}

export function createAppHarness({
  storage,
  repositories = createLocalPlatformRepositories({ storage }),
  subjects = SUBJECTS,
  now = () => Date.now(),
  subscribers = null,
  runtimeBoundary = createSubjectRuntimeBoundary(),
  scheduler = null,
  extraServices = {},
} = {}) {
  const tts = makeTts();
  const controller = createAppController({
    repositories,
    subjects,
    now,
    subscribers,
    runtimeBoundary,
    scheduler,
    tts,
    services: extraServices,
  });

  function render() {
    const appState = controller.store.getState();
    if (appState.route.screen === 'subject' && appState.route.subjectId === 'spelling') {
      const html = renderReactControllerApp(controller);
      controller.ensureSpellingAutoAdvanceFromCurrentState();
      return html;
    }
    const html = renderApp(appState, controller.contextFor(appState.route.subjectId || 'spelling'));
    controller.ensureSpellingAutoAdvanceFromCurrentState();
    return html;
  }

  return {
    ...controller,
    render,
    scheduler,
  };
}
