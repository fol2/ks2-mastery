import React from 'react';
import { HeroBackdrop } from '../../../platform/ui/HeroBackdrop.jsx';

/* Thin Spelling wrapper around the platform HeroBackdrop.
 *
 * The legacy CSS rules under `.spelling-in-session .spelling-hero-layer
 * ::after { ... }` (mid-session tinting) and the existing playwright
 * mask coverage probes still pin `.spelling-hero-backdrop` /
 * `.spelling-hero-layer`. Carrying those class names through this
 * wrapper preserves the contracts while delegating every behaviour to
 * the shared component, so Grammar and Punctuation can render the same
 * primitive without inheriting Spelling-specific selectors. */
export function SpellingHeroBackdrop({ url, previousUrl = '' }) {
  return (
    <HeroBackdrop
      url={url}
      previousUrl={previousUrl}
      extraBackdropClassName="spelling-hero-backdrop"
      extraLayerClassName="spelling-hero-layer"
    />
  );
}
