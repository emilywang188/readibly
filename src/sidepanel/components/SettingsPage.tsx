import { useEffect, useState } from 'react';
import {
  defaultReadiblySettings,
  settingsStorageKey,
  warningCategoryOptions,
  type ReadiblySettings
} from '../../shared/settings';
import { Surface } from './Surface';

export function SettingsPage() {
  const [settings, setSettings] = useState<ReadiblySettings>(defaultReadiblySettings);
  const [status, setStatus] = useState('Synced locally');
  const [customTermsInput, setCustomTermsInput] = useState(defaultReadiblySettings.customWarningTerms.join(', '));

  useEffect(() => {
    void (async () => {
      try {
        const response = await chrome.storage.local.get(settingsStorageKey);
        const stored = response?.[settingsStorageKey] as Partial<ReadiblySettings> | undefined;
        if (stored) {
          const merged = { ...defaultReadiblySettings, ...stored };
          setSettings(merged);
          setCustomTermsInput((merged.customWarningTerms ?? []).join(', '));
        }
      } catch {
        setStatus('Storage unavailable');
      }
    })();
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          await chrome.storage.local.set({ [settingsStorageKey]: settings });
          setStatus('Synced locally');
        } catch {
          setStatus('Storage unavailable');
        }
      })();
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [settings]);

  return (
    <section className="settings-view">
      <div className="summary-header">
        <div>
          <div className="eyebrow">Preferences</div>
          <h2>Panel settings</h2>
        </div>
        <div className="summary-meta">{status}</div>
      </div>

      <Surface tone="white" className="settings-card">
        <SettingToggle
          label="Auto-scan on panel open"
          description="Start scanning when the side panel opens."
          checked={settings.autoScanOnOpen}
          onChange={(checked) => setSettings((prev) => ({ ...prev, autoScanOnOpen: checked }))}
        />

        <SettingToggle
          label="Show clause highlights"
          description="Display highlighted risk clauses in summary cards."
          checked={settings.showClauseHighlights}
          onChange={(checked) => setSettings((prev) => ({ ...prev, showClauseHighlights: checked }))}
        />

        <SettingToggle
          label="Show citations"
          description="Attach source snippets to generated insights."
          checked={settings.showCitations}
          onChange={(checked) => setSettings((prev) => ({ ...prev, showCitations: checked }))}
        />

        <div className="settings-divider" />

        <div className="settings-field">
          <div className="settings-label">Summary red flags</div>
          <p className="settings-help">
            Choose which terms and conditions should always be flagged in your summary cards.
          </p>

          <div className="settings-category-grid">
            {warningCategoryOptions.map((category) => {
              const isChecked = settings.warningCategories.includes(category);

              return (
                <label key={category} className="settings-category-option">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setSettings((prev) => ({
                        ...prev,
                        warningCategories: checked
                          ? Array.from(new Set([...prev.warningCategories, category]))
                          : prev.warningCategories.filter((item) => item !== category)
                      }));
                    }}
                  />
                  <span>{category}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="settings-field">
          <label className="settings-label" htmlFor="custom-warning-terms">
            Custom warning terms
          </label>
          <p className="settings-help">Comma-separated keywords (for example: arbitration, indemnity, biometrics).</p>
          <textarea
            id="custom-warning-terms"
            className="settings-textarea"
            rows={3}
            value={customTermsInput}
            onChange={(event) => {
              const value = event.target.value;
              setCustomTermsInput(value);
              setSettings((prev) => ({
                ...prev,
                customWarningTerms: parseCustomTerms(value)
              }));
            }}
          />
        </div>
      </Surface>
    </section>
  );
}

function parseCustomTerms(value: string) {
  return value
    .split(',')
    .map((term) => term.trim())
    .filter((term, index, all) => Boolean(term) && all.indexOf(term) === index);
}

function SettingToggle({
  label,
  description,
  checked,
  onChange
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="settings-toggle-row">
      <div>
        <div className="settings-label">{label}</div>
        <p className="settings-help">{description}</p>
      </div>

      <button
        type="button"
        className={`settings-toggle ${checked ? 'is-on' : ''}`.trim()}
        aria-pressed={checked}
        onClick={() => onChange(!checked)}
      >
        <span className="settings-toggle__thumb" />
      </button>
    </div>
  );
}
