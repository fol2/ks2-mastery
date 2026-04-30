import React from 'react';
import { AdminPanelFrame } from './AdminPanelFrame.jsx';
import { SectionHeader } from '../../platform/ui/SectionHeader.jsx';
import { SUBJECT_THEMES, SUBJECT_IDS } from '../../platform/ui/subject-themes.js';
import { MONSTER_ASSET_MANIFEST } from '../../platform/game/monster-asset-manifest.js';
import { BUNDLED_MONSTER_VISUAL_CONFIG, MONSTER_VISUAL_CONTEXTS, MONSTER_VISUAL_MOTION_PROFILE_OPTIONS } from '../../platform/game/monster-visual-config.js';
import { MONSTERS, MONSTERS_BY_SUBJECT } from '../../platform/game/monsters.js';

// U8: Read-only diagnostic panel for admin inspection of subject theme tokens,
// monster asset availability, and visual engine configuration.
// NO production write endpoints — diagnostic display only.

function detectPlaceholderAssets(manifest) {
  // Assets with sizes array containing only 320 and no real srcBySize entries
  // or where the path references a lean/placeholder stub are flagged as
  // "placeholder" (info-level), never as "broken" (error-level).
  const results = [];
  for (const asset of manifest.assets) {
    const hasSrc = asset.srcBySize && Object.keys(asset.srcBySize).length > 0;
    const isPlaceholder = !hasSrc || asset.placeholder === true;
    if (isPlaceholder) {
      results.push({ key: asset.key, status: 'placeholder' });
    }
  }
  return results;
}

function detectMissingAltText(manifest) {
  // Monster assets that lack an alt text mapping
  return manifest.assets
    .filter((a) => !a.alt && !MONSTERS[a.monsterId]?.name)
    .map((a) => a.key);
}

function getMotionProfiles() {
  const profiles = new Map();
  const config = BUNDLED_MONSTER_VISUAL_CONFIG;
  for (const [assetKey, entry] of Object.entries(config.assets)) {
    for (const ctx of MONSTER_VISUAL_CONTEXTS) {
      const profile = entry.contexts?.[ctx]?.motionProfile;
      if (profile && profile !== 'still') {
        if (!profiles.has(profile)) profiles.set(profile, []);
        profiles.get(profile).push(`${assetKey}/${ctx}`);
      }
    }
  }
  return profiles;
}

export function AdminVisualEngineSection() {
  const placeholders = detectPlaceholderAssets(MONSTER_ASSET_MANIFEST);
  const missingAlt = detectMissingAltText(MONSTER_ASSET_MANIFEST);
  const motionProfiles = getMotionProfiles();
  const totalAssets = MONSTER_ASSET_MANIFEST.assets.length;

  return (
    <AdminPanelFrame
      eyebrow="Visual Engine"
      title="Asset & Property Diagnostics"
      subtitle="Read-only inspection of theme tokens, monster assets, and visual configuration."
      data={SUBJECT_IDS}
      refreshedAt={Date.now()}
    >
      {/* Subject Theme Tokens */}
      <SectionHeader
        eyebrow="Theme Registry"
        title="Subject Theme Tokens"
        level={3}
        data-testid="section-subject-themes"
      />
      <table className="admin-table" data-testid="theme-tokens-table">
        <thead>
          <tr>
            <th>Subject</th>
            <th>Accent</th>
            <th>Ink</th>
            <th>Soft</th>
            <th>Border</th>
          </tr>
        </thead>
        <tbody>
          {SUBJECT_IDS.map((id) => {
            const theme = SUBJECT_THEMES[id];
            return (
              <tr key={id} data-subject={id}>
                <td><strong>{id}</strong></td>
                <td><code>{theme.accent}</code></td>
                <td><code>{theme.accentInk}</code></td>
                <td><code>{theme.accentSoft}</code></td>
                <td><code>{theme.accentBorder}</code></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Monster Asset Availability */}
      <SectionHeader
        eyebrow="Monster System"
        title="Asset Availability"
        level={3}
        statusChip={<span className="chip good">{totalAssets} assets</span>}
        data-testid="section-monster-assets"
      />
      <div data-testid="monster-availability">
        {Object.entries(MONSTERS_BY_SUBJECT).map(([subjectKey, monsterIds]) => (
          <div key={subjectKey} style={{ marginBottom: 12 }}>
            <strong>{subjectKey}:</strong>{' '}
            {monsterIds.map((mId) => (
              <span key={mId} className="chip" style={{ marginRight: 4 }}>
                {MONSTERS[mId]?.name || mId}
              </span>
            ))}
          </div>
        ))}
      </div>

      {/* Placeholder Detection */}
      <SectionHeader
        eyebrow="Asset Health"
        title="Placeholder Detection"
        level={3}
        statusChip={
          placeholders.length > 0
            ? <span className="chip" data-severity="info">{placeholders.length} placeholder(s)</span>
            : <span className="chip good">All assets present</span>
        }
        data-testid="section-placeholders"
      />
      {placeholders.length > 0 ? (
        <ul data-testid="placeholder-list">
          {placeholders.map((p) => (
            <li key={p.key}>
              <code>{p.key}</code>{' '}
              <span className="chip" data-severity="info" data-status="placeholder">placeholder</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>No placeholder assets detected in the current manifest.</p>
      )}

      {/* Background / Stage Assignments */}
      <SectionHeader
        eyebrow="Visual Contexts"
        title="Background & Stage Assignments"
        level={3}
        data-testid="section-stage-assignments"
      />
      <div data-testid="visual-contexts">
        <p><strong>Registered contexts:</strong>{' '}
          {MONSTER_VISUAL_CONTEXTS.map((ctx) => (
            <span key={ctx} className="chip" style={{ marginRight: 4 }}>{ctx}</span>
          ))}
        </p>
        <p><strong>Config source:</strong> {BUNDLED_MONSTER_VISUAL_CONFIG.source}</p>
        <p><strong>Schema version:</strong> {BUNDLED_MONSTER_VISUAL_CONFIG.schemaVersion}</p>
        <p><strong>Manifest hash:</strong> <code>{BUNDLED_MONSTER_VISUAL_CONFIG.manifestHash}</code></p>
      </div>

      {/* Motion Profiles */}
      <SectionHeader
        eyebrow="Animation"
        title="Motion Profiles"
        level={3}
        statusChip={<span className="chip">{motionProfiles.size} active profile(s)</span>}
        data-testid="section-motion-profiles"
      />
      <div data-testid="motion-profiles">
        {MONSTER_VISUAL_MOTION_PROFILE_OPTIONS.map((profile) => (
          <div key={profile} style={{ marginBottom: 4 }}>
            <code>{profile}</code>:{' '}
            {motionProfiles.has(profile)
              ? <span className="chip">{motionProfiles.get(profile).length} binding(s)</span>
              : <span className="chip" style={{ opacity: 0.5 }}>unused</span>
            }
          </div>
        ))}
      </div>

      {/* Missing Alt Text Warnings */}
      <SectionHeader
        eyebrow="Accessibility"
        title="Missing Alt Text"
        level={3}
        statusChip={
          missingAlt.length > 0
            ? <span className="chip bad">{missingAlt.length} missing</span>
            : <span className="chip good">All covered</span>
        }
        data-testid="section-alt-text"
      />
      {missingAlt.length > 0 ? (
        <ul data-testid="missing-alt-list">
          {missingAlt.map((key) => (
            <li key={key}><code>{key}</code> — no alt text source</li>
          ))}
        </ul>
      ) : (
        <p>All monster assets have alt text coverage via the MONSTERS registry.</p>
      )}
    </AdminPanelFrame>
  );
}
