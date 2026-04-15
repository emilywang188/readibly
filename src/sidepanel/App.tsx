import { useEffect, useMemo, useState } from 'react';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import type { PanelTab, ScanResult } from '../shared/types';
import { defaultReadiblySettings, settingsStorageKey, type ReadiblySettings } from '../shared/settings';
import { sendRuntimeMessage } from '../shared/messages';
import { ChatPage } from './components/ChatPage';
import { FeatureCard } from './components/FeatureCard';
import { PrimaryButton } from './components/PrimaryButton';
import { SettingsPage } from './components/SettingsPage';
import { Surface } from './components/Surface';
import { CloseIcon, LockIcon, RefreshIcon, SearchIcon, ShieldIcon } from './components/icons';
import { TabRail } from './components/TabRail';

type ViewState = 'onboarding' | 'scanning' | 'summary';

const scanDelayMs = 950;

export function App() {
  const [activeTab, setActiveTab] = useState<PanelTab>('summary');
  const [viewState, setViewState] = useState<ViewState>('onboarding');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [statusText, setStatusText] = useState('Ready to scan the current page.');
  const [settings, setSettings] = useState<ReadiblySettings>(defaultReadiblySettings);

  const contentKey = useMemo(() => `${viewState}:${activeTab}`, [viewState, activeTab]);

  useEffect(() => {
    if (viewState !== 'scanning') return;

    const timer = window.setTimeout(() => {
      setViewState('summary');
      setStatusText('Scan complete. Review the structured summary below.');
    }, scanDelayMs);

    return () => window.clearTimeout(timer);
  }, [viewState]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await chrome.storage.local.get(settingsStorageKey);
        const stored = response?.[settingsStorageKey] as Partial<ReadiblySettings> | undefined;
        if (stored) {
          setSettings({ ...defaultReadiblySettings, ...stored });
        }
      } catch {
        // Ignore unavailable storage in non-extension contexts.
      }
    })();

    const handleStorageUpdate: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, area) => {
      if (area !== 'local') return;
      const updated = changes[settingsStorageKey]?.newValue as Partial<ReadiblySettings> | undefined;
      if (!updated) return;
      setSettings({ ...defaultReadiblySettings, ...updated });
    };

    chrome.storage.onChanged.addListener(handleStorageUpdate);
    return () => chrome.storage.onChanged.removeListener(handleStorageUpdate);
  }, []);

  const handleScan = async () => {
    setActiveTab('summary');
    setViewState('scanning');
    setStatusText('Scanning this page with local processing...');

    try {
      const result = await sendRuntimeMessage<ScanResult>({ type: 'READIBLY_SCAN_REQUEST' });
      setScanResult(result);
    } catch {
      setScanResult(null);
    }
  };

  const handleRefresh = () => {
    setActiveTab('summary');
    setViewState('onboarding');
    setScanResult(null);
    setStatusText('Ready to scan the current page.');
  };

  const handleClose = () => {
    setViewState('onboarding');
    setStatusText('Panel controls are reserved for future close behavior.');
    void sendRuntimeMessage<{ ok: boolean }>({ type: 'READIBLY_CLOSE_PANEL' });
  };

  return (
    <div className="app-shell">
      <Surface tone="soft" className="panel-frame">
        <div className="panel-stage" data-state={viewState} key={contentKey}>
          <header className="top-bar">
            <div className="brand-lockup">
              <span className="brand-name">Readibly</span>
            </div>

            <div className="top-bar__actions">
              <button type="button" className="icon-button" onClick={handleRefresh} aria-label="Refresh panel">
                <RefreshIcon className="icon-button__icon" />
              </button>
              <button type="button" className="icon-button" onClick={handleClose} aria-label="Close panel">
                <CloseIcon className="icon-button__icon" />
              </button>
            </div>
          </header>

          <main className="main-layout">
            <section className="main-content">
              {viewState !== 'summary' ? (
                <OnboardingSection onScan={handleScan} statusText={statusText} />
              ) : activeTab === 'chat' ? (
                <ChatPage result={scanResult} />
              ) : activeTab === 'settings' ? (
                <SettingsPage />
              ) : (
                <SummarySection result={scanResult} settings={settings} />
              )}
            </section>

            <TabRail activeTab={activeTab} onChange={(tab) => setActiveTab(tab)} />
          </main>
        </div>
      </Surface>
    </div>
  );
}

function OnboardingSection({ onScan, statusText }: { onScan: () => void; statusText: string }) {
  return (
    <section className="onboarding">
      <div className="eyebrow">The sovereign lens</div>
      <h1>Ready to Decode</h1>
      <p className="lead">
        Readibly is standing by. We can automatically distill complex legal language into clear, actionable summaries
        of rights and obligations.
      </p>

      <PrimaryButton
        className="scan-button"
        icon={<SearchIcon className="primary-button__icon-svg" />}
        label="SCAN THIS PAGE"
        onClick={onScan}
      />

      <div className="feature-grid">
        <FeatureCard
          icon={<ShieldIcon className="feature-card__svg" />}
          title="Private & Secure"
          description="Your data never leaves your browser. All analysis is performed within this extension's private sandbox."
        />
        <FeatureCard
          icon={<LockIcon className="feature-card__svg" />}
          title="Local Processing"
          description="Leveraging on-device neural networks to provide instantaneous clarity without external API calls."
        />
      </div>

      <footer className="onboarding__footer">
        <div className="footer-kicker">THE SOVEREIGN LENS</div>
        <p className="footer-copy">
          Summaries are informational, not legal advice.
        </p>
        <div className="status-pill" aria-live="polite">
          {statusText}
        </div>
      </footer>
    </section>
  );
}

function SummarySection({
  result,
  settings
}: {
  result: ScanResult | null;
  settings: ReadiblySettings;
}) {
  const mockedSummaryCards = [
    {
      title: 'Data Collection',
      body: 'The app gathers personal details, device data, and how you use the service, meaning your activity can be tracked and analyzed over time.'
    },
    {
      title: 'Location Access',
      body: 'The app may access your location, which could be used not just for core features but also for tracking and personalization.'
    },
    {
      title: 'Third-Party Sharing',
      body: 'Your data may be shared with outside companies like advertisers or analytics providers, extending its use beyond the app itself.'
    },
    {
      title: 'Ownership of Your Content',
      body: 'Anything you upload can be used, modified, or distributed by the company, even if you still technically own it.'
    },
    {
      title: 'Dispute Resolution',
      body: 'You may give up your right to sue in court or join class action lawsuits, limiting how you can challenge the company legally.'
    }
  ];

  const summaryCards = result
    ? [
        {
          title: 'Detected Page Context',
          body: `${result.page.title}${result.page.hostname ? ` • ${result.page.hostname}` : ''}`
        },
        ...mockedSummaryCards
      ]
    : mockedSummaryCards;

  const warningTerms = settings.customWarningTerms.map((term) => term.toLowerCase());

  const isCardFlagged = (title: string, body: string) => {
    if (settings.warningCategories.includes(title as ReadiblySettings['warningCategories'][number])) {
      return true;
    }

    const haystack = `${title} ${body}`.toLowerCase();
    return warningTerms.some((term) => term.length > 0 && haystack.includes(term));
  };

  return (
    <section className="summary-view">
      <div className="summary-header">
        <div>
          <div className="eyebrow">Structured overview</div>
          <h2>Agreement snapshot</h2>
        </div>
        <div className="summary-meta">
          {result ? `Updated ${new Date(result.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Stub mode'}
        </div>
      </div>

      <div className="summary-grid">
        {summaryCards.map((card) => (
          <Surface key={card.title} tone="white" className="summary-card">
            <div className="summary-card__label-row">
              <div className="summary-card__label">{card.title}</div>
              {isCardFlagged(card.title, card.body) ? <span className="summary-card__flag">🚩 Flag</span> : null}
            </div>
            <p>{card.body}</p>
          </Surface>
        ))}
      </div>
    </section>
  );
}
