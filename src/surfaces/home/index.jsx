import React from 'react';
import { createRoot } from 'react-dom/client';
import { CodexSurface } from './CodexSurface.jsx';
import { HomeSurface } from './HomeSurface.jsx';

function createSurfaceRenderer(Component) {
  let currentRoot = null;
  let currentContainer = null;

  function render(container, props) {
    if (!container) return;
    if (currentContainer && currentContainer !== container) {
      try { currentRoot?.unmount(); } catch (error) { /* ignore */ }
      currentRoot = null;
      currentContainer = null;
    }
    if (!currentRoot) {
      currentRoot = createRoot(container);
      currentContainer = container;
    }
    currentRoot.render(<Component {...props} />);
  }

  function unmount() {
    if (!currentRoot) return;
    try { currentRoot?.unmount(); } catch (error) { /* ignore */ }
    currentRoot = null;
    currentContainer = null;
  }

  return { render, unmount };
}

window.__ks2HomeSurface = createSurfaceRenderer(HomeSurface);
window.__ks2CodexSurface = createSurfaceRenderer(CodexSurface);
