import { useEffect, useMemo, useState } from 'react';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import type { PanelTab, ScanResult, SummaryCard } from '../shared/types';
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

// One-shot example cards used as style/format reference for Claude
const EXAMPLE_CARDS = [
  { title: 'Data Collection', body: 'The app gathers personal details, device data, and how you use the service, meaning your activity can be tracked and analyzed over time.' },
  { title: 'Location Access', body: 'The app may access your location, which could be used not just for core features but also for tracking and personalization.' },
  { title: 'Third-Party Sharing', body: 'Your data may be shared with outside companies like advertisers or analytics providers, extending its use beyond the app itself.' },
  { title: 'Ownership of Your Content', body: 'Anything you upload can be used, modified, or distributed by the company, even if you still technically own it.' },
  { title: 'Dispute Resolution', body: 'You may give up your right to sue in court or join class action lawsuits, limiting how you can challenge the company legally.' }
];

const SUMMARY_SYSTEM = `You are Readibly, a legal document analyzer embedded in a Chrome extension. Analyze web page content and extract key legal, privacy, or contractual clauses — explained in plain English.

Return ONLY a valid JSON array. No markdown fences, no preamble. Each element must be: {"title": string, "body": string}.

Here is the exact style and format to follow (one-shot example):
${JSON.stringify(EXAMPLE_CARDS, null, 2)}

Rules:
- Generate 3–7 cards covering only categories genuinely present in the content.
- Body: 1–2 plain-English sentences. No legal jargon. Focus on what it means for the user.
- Short, specific title labels (e.g. "Auto-Renewal", "Data Retention", "Payment Terms").
- If the page is not a legal/privacy document, return a single card explaining what the page is about.
- Respond with the JSON array only — nothing else.`;

async function generateSummaryCards(apiKey: string, result: ScanResult): Promise<SummaryCard[]> {
  const pageContent = [
    `Title: ${result.page.title}`,
    `URL: ${result.page.url || 'N/A'}`,
    result.page.headings.length > 0 ? `Headings: ${result.page.headings.join(' | ')}` : '',
    `Content excerpt: ${result.page.excerpt}`,
    result.page.selection ? `User selection: ${result.page.selection}` : ''
  ]
    .filter(Boolean)
    .join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system: SUMMARY_SYSTEM,
      messages: [{ role: 'user', content: `Analyze this page and generate summary cards:\n\n${pageContent}` }]
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `API error ${res.status}`);
  }

  const data = await res.json() as { content: Array<{ type: string; text: string }> };
  const text = data.content.filter((b) => b.type === 'text').map((b) => b.text).join('');

  // Strip any accidental markdown fences
  const clean = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  const parsed = JSON.parse(clean) as SummaryCard[];
  if (!Array.isArray(parsed)) throw new Error('Invalid response shape');
  return parsed;
}

export function App() {
  const [activeTab, setActiveTab] = useState<PanelTab>('summary');
  const [viewState, setViewState] = useState<ViewState>('onboarding');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [generatedCards, setGeneratedCards] = useState<SummaryCard[] | null>(null);
  const [statusText, setStatusText] = useState('Ready to scan the current page.');
  const [scanError, setScanError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ReadiblySettings>(defaultReadiblySettings);

  const contentKey = useMemo(() => `${viewState}:${activeTab}`, [viewState, activeTab]);

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
    setScanError(null);
    setGeneratedCards(null);
    setStatusText('Collecting page content…');

    try {
      const result = await sendRuntimeMessage<ScanResult>({ type: 'READIBLY_SCAN_REQUEST' });
      setScanResult(result);

      if (settings.apiKey) {
        setStatusText('Analyzing with Claude AI…');
        try {
          const cards = await generateSummaryCards(settings.apiKey, result);
          setGeneratedCards(cards);
        } catch (aiErr) {
          const msg = aiErr instanceof Error ? aiErr.message : 'AI analysis failed';
          setScanError(msg);
          // Fall through — show fallback cards
        }
      }

      setViewState('summary');
      setStatusText('Scan complete.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scan failed';
      setScanError(msg);
      setViewState('summary');
      setStatusText('Scan failed — see summary for details.');
    }
  };

  const handleRefresh = () => {
    setActiveTab('summary');
    setViewState('onboarding');
    setScanResult(null);
    setGeneratedCards(null);
    setScanError(null);
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
                <OnboardingSection onScan={handleScan} statusText={statusText} scanning={viewState === 'scanning'} />
              ) : activeTab === 'chat' ? (
                <ChatPage result={scanResult} />
              ) : activeTab === 'settings' ? (
                <SettingsPage />
              ) : (
                <SummarySection
                  result={scanResult}
                  settings={settings}
                  generatedCards={generatedCards}
                  scanError={scanError}
                />
              )}
            </section>

            <TabRail activeTab={activeTab} onChange={(tab) => setActiveTab(tab)} />
          </main>
        </div>
      </Surface>
    </div>
  );
}

function OnboardingSection({
  onScan,
  statusText,
  scanning
}: {
  onScan: () => void;
  statusText: string;
  scanning: boolean;
}) {
  return (
    <section className="onboarding">
      <h1>Ready to Decode</h1>
      <p className="lead">
        Readibly distills complex legal language into clear, actionable summaries of your rights and obligations — powered by Claude AI.
      </p>

      <PrimaryButton
        className="scan-button"
        icon={<SearchIcon className="primary-button__icon-svg" />}
        label={scanning ? 'SCANNING…' : 'SCAN THIS PAGE'}
        onClick={onScan}
        disabled={scanning}
      />

      <div className="feature-grid">
        <FeatureCard
          icon={<ShieldIcon className="feature-card__svg" />}
          title="Private & Secure"
          description="Your API key is stored locally. Page content is only sent to Anthropic's API — never to third parties."
        />
        <FeatureCard
          icon={<LockIcon className="feature-card__svg" />}
          title="AI-Powered Analysis"
          description="Claude reads the full page context and flags the clauses that matter most to you."
        />
      </div>

      <footer className="onboarding__footer">
        <div className="footer-kicker">THE SOVEREIGN LENS</div>
        <p className="footer-copy">Summaries are informational, not legal advice.</p>
        <div className="status-pill" aria-live="polite">
          {statusText}
        </div>
      </footer>
    </section>
  );
}

function SummarySection({
  result,
  settings,
  generatedCards,
  scanError
}: {
  result: ScanResult | null;
  settings: ReadiblySettings;
  generatedCards: SummaryCard[] | null;
  scanError: string | null;
}) {
  const fallbackCards: SummaryCard[] = EXAMPLE_CARDS;

  // Prefer AI-generated cards, fall back to example cards
  const summaryCards: SummaryCard[] = generatedCards ?? fallbackCards;

  // Prepend a page context card when we have a real scan result
  const displayCards: SummaryCard[] = result
    ? [{ title: 'Page Scanned', body: `${result.page.title}${result.page.hostname ? ` · ${result.page.hostname}` : ''}` }, ...summaryCards]
    : summaryCards;

  const warningTerms = settings.customWarningTerms.map((t) => t.toLowerCase());

  const isCardFlagged = (title: string, body: string) => {
    if (settings.warningCategories.includes(title as ReadiblySettings['warningCategories'][number])) return true;
    const hay = `${title} ${body}`.toLowerCase();
    return warningTerms.some((t) => t.length > 0 && hay.includes(t));
  };

  const aiMode = !!generatedCards;

  return (
    <section className="summary-view">
      <div className="summary-header">
        <div>
          <h2>Agreement snapshot</h2>
        </div>
        <div className="summary-meta">
          {result
            ? aiMode
              ? 'Claude AI'
              : (scanError ? 'Fallback mode' : 'No API key')
            : 'Example'}
        </div>
      </div>

      {scanError && (
        <div className="summary-error-banner">
          ⚠ {scanError}
        </div>
      )}

      {!result && !generatedCards && (
        <div style={{ fontSize: '11px', color: 'var(--ink-2)', marginBottom: '4px' }}>
          Showing example cards — scan a page to analyze it.
        </div>
      )}

      <div className="summary-grid">
        {displayCards.map((card) => (
          <Surface key={card.title} tone="white" className="summary-card">
            <div className="summary-card__label-row">
              <div className="summary-card__label">{card.title}</div>
              {isCardFlagged(card.title, card.body) ? (
                <span className="summary-card__flag">🚩 Flag</span>
              ) : null}
            </div>
            <p>{card.body}</p>
          </Surface>
        ))}
      </div>
    </section>
  );
}