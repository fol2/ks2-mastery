// Shared paramSchema source-of-truth for the closed effect-template set.
//
// Both the templates (`./<id>.js`) and the schema validator
// (`../effect-config-schema.js`) need to know each template's typed param
// surface. Templates additionally render JSX, which makes them unimportable
// from plain `node --test` paths the validator runs under.
//
// We resolve the split by hosting the param schemas here — JSX-free, so any
// node-only path can import them — and re-exporting them from both consumers.
// One source, no drift, no node-vs-bundler import gymnastics.

export const TEMPLATE_PARAM_SCHEMAS = Object.freeze({
  motion: Object.freeze({}),
  glow: Object.freeze({
    intensity: Object.freeze({ type: 'number', default: 0.6, min: 0, max: 1 }),
    palette: Object.freeze({ type: 'enum', default: 'accent', values: Object.freeze(['accent', 'secondary', 'pale']) }),
  }),
  sparkle: Object.freeze({
    intensity: Object.freeze({ type: 'number', default: 0.6, min: 0, max: 1 }),
    palette: Object.freeze({ type: 'enum', default: 'accent', values: Object.freeze(['accent', 'secondary', 'pale']) }),
  }),
  aura: Object.freeze({
    intensity: Object.freeze({ type: 'number', default: 0.8, min: 0, max: 1 }),
  }),
  'pulse-halo': Object.freeze({
    intensity: Object.freeze({ type: 'number', default: 0.5, min: 0, max: 1 }),
    palette: Object.freeze({ type: 'enum', default: 'pale', values: Object.freeze(['accent', 'secondary', 'pale']) }),
  }),
  'particles-burst': Object.freeze({
    // Mirror of `particles-burst.js` paramSchema. Mode discriminator selects
    // the per-kind body inside the celebration shell.
    mode: Object.freeze({ type: 'enum', values: Object.freeze(['caught', 'evolve']), required: true }),
  }),
  'shine-streak': Object.freeze({}),
});

export function lookupTemplateParamSchema(id) {
  if (typeof id !== 'string' || id.length === 0) return null;
  return TEMPLATE_PARAM_SCHEMAS[id] || null;
}
