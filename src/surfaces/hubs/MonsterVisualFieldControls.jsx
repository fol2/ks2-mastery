import React from 'react';

const BASELINE_NUMERIC_FIELDS = Object.freeze([
  'scale',
  'offsetX',
  'offsetY',
  'anchorX',
  'anchorY',
  'cropX',
  'cropY',
  'cropWidth',
  'cropHeight',
  'opacity',
]);

const CONTEXT_NUMERIC_FIELDS = Object.freeze([
  'offsetX',
  'offsetY',
  'scale',
  'anchorX',
  'anchorY',
  'shadowX',
  'shadowY',
  'shadowScale',
  'shadowOpacity',
  'layer',
  'duration',
  'delay',
  'bob',
  'tilt',
  'footPad',
  'cropX',
  'cropY',
  'cropWidth',
  'cropHeight',
]);

const PATH_OPTIONS = Object.freeze(['none', 'walk', 'walk-b', 'fly-a', 'fly-b']);
const MOTION_OPTIONS = Object.freeze(['still', 'egg-breathe', 'walk', 'walk-b', 'fly-a', 'fly-b']);

function labelFor(field) {
  return String(field || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function numericStep(field) {
  if (field === 'opacity' || field === 'shadowOpacity') return '0.05';
  if (field.includes('Scale') || field === 'scale') return '0.05';
  if (field.startsWith('anchor') || field.startsWith('crop')) return '0.05';
  return '1';
}

function NumberField({ field, value, disabled, onChange }) {
  return (
    <label className="field monster-visual-field">
      <span>{labelFor(field)}</span>
      <input
        className="input"
        type="number"
        step={numericStep(field)}
        value={Number.isFinite(Number(value)) ? String(value) : '0'}
        disabled={disabled}
        onChange={(event) => onChange(field, Number(event.target.value))}
      />
    </label>
  );
}

export function MonsterVisualFieldControls({
  assetEntry,
  contextEntry,
  selectedContext,
  disabled = false,
  onBaselineChange = () => {},
  onContextChange = () => {},
  onMarkReviewed = () => {},
  onResetContext = () => {},
} = {}) {
  if (!assetEntry || !contextEntry) return null;
  const reviewed = assetEntry.review?.contexts?.[selectedContext]?.reviewed === true;

  return (
    <div className="monster-visual-controls">
      <div className="monster-visual-control-group">
        <div className="monster-visual-control-title">
          <strong>Baseline</strong>
          <span className={`chip ${assetEntry.baseline?.facing === 'right' ? 'learning' : ''}`}>
            {assetEntry.baseline?.facing || 'left'}
          </span>
        </div>
        <div className="monster-visual-fields">
          <label className="field monster-visual-field">
            <span>Facing</span>
            <select
              className="select"
              value={assetEntry.baseline?.facing === 'right' ? 'right' : 'left'}
              disabled={disabled}
              onChange={(event) => onBaselineChange('facing', event.target.value)}
            >
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </label>
          {BASELINE_NUMERIC_FIELDS.map((field) => (
            <NumberField
              field={field}
              value={assetEntry.baseline?.[field]}
              disabled={disabled}
              onChange={onBaselineChange}
              key={field}
            />
          ))}
        </div>
      </div>

      <div className="monster-visual-control-group">
        <div className="monster-visual-control-title">
          <strong>{labelFor(selectedContext)}</strong>
          <span className={`chip ${reviewed ? 'good' : 'warn'}`}>{reviewed ? 'Reviewed' : 'Needs review'}</span>
        </div>
        <div className="monster-visual-fields">
          <label className="field monster-visual-field">
            <span>Path</span>
            <select
              className="select"
              value={contextEntry.path || 'none'}
              disabled={disabled}
              onChange={(event) => onContextChange('path', event.target.value)}
            >
              {PATH_OPTIONS.map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
          </label>
          <label className="field monster-visual-field">
            <span>Motion profile</span>
            <select
              className="select"
              value={contextEntry.motionProfile || 'still'}
              disabled={disabled}
              onChange={(event) => onContextChange('motionProfile', event.target.value)}
            >
              {MOTION_OPTIONS.map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
          </label>
          {CONTEXT_NUMERIC_FIELDS.map((field) => (
            <NumberField
              field={field}
              value={contextEntry[field]}
              disabled={disabled}
              onChange={onContextChange}
              key={field}
            />
          ))}
        </div>
        <div className="actions" style={{ marginTop: 12 }}>
          <button className="btn good" type="button" disabled={disabled || reviewed} onClick={() => onMarkReviewed(selectedContext)}>Mark reviewed</button>
          <button className="btn ghost" type="button" disabled={disabled} onClick={() => onResetContext(selectedContext)}>Reset context</button>
        </div>
      </div>
    </div>
  );
}

