import React from 'react';
import { createRoot } from 'react-dom/client';
import { HomeSurface } from './HomeSurface.jsx';

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
  currentRoot.render(<HomeSurface {...props} />);
}

function unmount() {
  if (!currentRoot) return;
  try { currentRoot.unmount(); } catch (error) { /* ignore */ }
  currentRoot = null;
  currentContainer = null;
}

window.__ks2HomeSurface = { render, unmount };
