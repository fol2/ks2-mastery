import { useSetupHeroContrast as platformUseSetupHeroContrast } from '../../../platform/ui/useSetupHeroContrast.js';
import { heroContrastProfileForBg } from './spelling-view-model.js';

/* Spelling-flavoured wrapper around the platform contrast hook.
 *
 * The platform hook is selector-agnostic; Spelling threads its
 * curated `heroContrastProfileForBg` (per-tone shell / controls / card
 * tone profiles) and the `.mode-card` / `.tool-label` / `.length-unit`
 * selectors that Spelling's setup scene paints. Existing callers do not
 * change — they still call `useSetupHeroContrast(heroBg, mode)` and get
 * back `{ ref, contrast }`. */
export function useSetupHeroContrast(heroBg, mode) {
  return platformUseSetupHeroContrast(heroBg, mode, {
    staticContrastForBg: heroContrastProfileForBg,
    cardSelector: '.mode-card',
    controlSelectors: ['.tool-label', '.length-unit'],
  });
}
