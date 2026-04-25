import React from 'react';

// Typed input controls per `paramSchema` field type. Mirrors the structure
// of `MonsterVisualFieldControls` so the catalog panel composes a row of
// fields driven entirely by the chosen template's schema.
//
// One component per type (`number`, `string`, `enum`, `boolean`). Inline
// errors are emitted from the parent (`MonsterEffectCatalogPanel`) using
// `catalogParamSchemaErrors` and threaded in via the `errors` prop.

function labelFor(field) {
  return String(field || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function FieldFrame({ name, schema, errors, children }) {
  const issues = Array.isArray(errors) ? errors : [];
  const required = schema?.required === true;
  return (
    <label className="field monster-effect-field">
      <span>
        {labelFor(name)}
        {required ? <span aria-hidden="true">{' *'}</span> : null}
      </span>
      {children}
      {issues.map((issue, index) => (
        <span className="field-error" key={index} role="alert">
          {issue.message}
        </span>
      ))}
    </label>
  );
}

function NumberInput({ name, descriptor, schema, disabled, onChange }) {
  const value = Number.isFinite(Number(descriptor?.default)) ? String(descriptor.default) : '';
  const min = typeof schema?.min === 'number' ? schema.min : undefined;
  const max = typeof schema?.max === 'number' ? schema.max : undefined;
  return (
    <input
      className="input"
      type="number"
      step="0.05"
      value={value}
      min={min}
      max={max}
      disabled={disabled}
      onChange={(event) => onChange(name, Number(event.target.value))}
    />
  );
}

function StringInput({ name, descriptor, disabled, onChange }) {
  return (
    <input
      className="input"
      type="text"
      value={typeof descriptor?.default === 'string' ? descriptor.default : ''}
      disabled={disabled}
      onChange={(event) => onChange(name, event.target.value)}
    />
  );
}

function EnumSelect({ name, descriptor, schema, disabled, onChange }) {
  const allowed = Array.isArray(schema?.values) ? schema.values : [];
  const value = descriptor?.default ?? '';
  return (
    <select
      className="select"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(name, event.target.value)}
    >
      {allowed.map((option) => (
        <option value={option} key={option}>{option}</option>
      ))}
    </select>
  );
}

function BooleanInput({ name, descriptor, disabled, onChange }) {
  const checked = descriptor?.default === true;
  return (
    <input
      className="input"
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(name, event.target.checked)}
    />
  );
}

export function MonsterEffectFieldControl({
  name,
  descriptor,
  schema,
  errors = [],
  disabled = false,
  onChange = () => {},
}) {
  if (!schema) return null;
  let control = null;
  if (schema.type === 'number') {
    control = <NumberInput name={name} descriptor={descriptor} schema={schema} disabled={disabled} onChange={onChange} />;
  } else if (schema.type === 'string') {
    control = <StringInput name={name} descriptor={descriptor} disabled={disabled} onChange={onChange} />;
  } else if (schema.type === 'enum') {
    control = <EnumSelect name={name} descriptor={descriptor} schema={schema} disabled={disabled} onChange={onChange} />;
  } else if (schema.type === 'boolean') {
    control = <BooleanInput name={name} descriptor={descriptor} disabled={disabled} onChange={onChange} />;
  } else {
    return null;
  }
  return (
    <FieldFrame name={name} schema={schema} errors={errors}>
      {control}
    </FieldFrame>
  );
}

export function MonsterEffectFieldControls({
  paramSchema = {},
  params = {},
  errorsByField = {},
  disabled = false,
  onChange = () => {},
} = {}) {
  const entries = Object.entries(paramSchema || {});
  if (entries.length === 0) {
    return <p className="small muted">This template has no configurable parameters.</p>;
  }
  return (
    <div className="monster-effect-fields">
      {entries.map(([name, schema]) => (
        <MonsterEffectFieldControl
          key={name}
          name={name}
          descriptor={params?.[name]}
          schema={schema}
          errors={errorsByField?.[name] || []}
          disabled={disabled}
          onChange={onChange}
        />
      ))}
    </div>
  );
}
