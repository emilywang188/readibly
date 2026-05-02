import { useEffect, useMemo, useRef, useState } from 'react';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import type { ClearHighlightsMessage, HighlightTextMessage, PanelTab, ScanResult, SummaryCard } from '../shared/types';
import { defaultReadiblySettings, settingsStorageKey, type ReadiblySettings } from '../shared/settings';
import { sendRuntimeMessage } from '../shared/messages';
import { ChatPage } from './components/ChatPage';
import { FeatureCard } from './components/FeatureCard';
import { PrimaryButton } from './components/PrimaryButton';
import { SettingsPage } from './components/SettingsPage';
import { Surface } from './components/Surface';
import { CloseIcon, LockIcon, RefreshIcon, SearchIcon, ShieldIcon, YieldIcon } from './components/icons';
import { TabRail } from './components/TabRail';

type ViewState = 'onboarding' | 'scanning' | 'summary';

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Data Collection': ['data collect', 'collect data', 'personal data', 'personal information', 'information we collect', 'gather'],
  'Location Access': ['location', 'gps', 'geolocation'],
  'Third-Party Sharing': ['third-part', 'third part', 'share your', 'share data', 'advertis', 'partner'],
  'Ownership of Content': ['your content', 'ownership', 'license to', 'intellectual property', 'content you'],
  'Auto-Renewal': ['auto-renew', 'automatically renew', 'automatic renewal', 'recurring charge', 'subscription renew', 'billed automatically', 'unless you cancel'],
  'Dispute Resolution': ['dispute', 'arbitrat', 'class action', 'lawsuit', 'litigation']
};

// One-shot example cards used as style/format reference for Claude
const EXAMPLE_CARDS: SummaryCard[] = [
  { title: 'Data Collection', body: 'The app gathers personal details, device data, and how you use the service, meaning your activity can be tracked and analyzed over time.' },
  { title: 'Location Access', body: 'The app may access your location, which could be used not just for core features but also for tracking and personalization.' },
  { title: 'Third-Party Sharing', body: 'Your data may be shared with outside companies like advertisers or analytics providers, extending its use beyond the app itself.' },
  { title: 'Ownership of Content', body: 'Anything you upload can be used, modified, or distributed by the company, even if you still technically own it.' },
  { title: 'Auto-Renewal', body: 'Your subscription renews automatically at the end of each billing period and you will be charged unless you cancel before the renewal date.' }
];

// Example cards with source quotes — used only in the system prompt as format reference.
const EXAMPLE_CARDS_WITH_SOURCE = EXAMPLE_CARDS.map((c, i) => ({
  ...c,
  source: [
    'we collect information about how you use our services',
    'we may collect precise location information',
    'we may share your information with our partners',
    'you grant us a worldwide, royalty-free license to use your content',
    'any disputes will be resolved through binding arbitration'
  ][i]
}));

const SUMMARY_SYSTEM = `You are Readibly, a legal document analyzer embedded in a Chrome extension. Analyze web page content and extract key legal, privacy, or contractual clauses — explained in plain English.

Return ONLY a valid JSON array. No markdown fences, no preamble. Each element must be: {"title": string, "body": string, "concern": boolean}.

Here is the exact style and format to follow (one-shot example):
${JSON.stringify(EXAMPLE_CARDS_WITH_SOURCE, null, 2)}

Rules:
- Generate 3–7 cards covering only categories genuinely present in the content.
- Body: 1–2 plain-English sentences. No legal jargon. Focus on what it means for the user.
- Short, specific title labels (e.g. "Auto-Renewal", "Data Retention", "Payment Terms").
- Set "concern": true ONLY for clauses that are genuinely dangerous or highly unusual: e.g. irrevocable/perpetual license to user content, waiver of legal rights, hidden fees, selling data to third parties, or terms that could seriously harm the user. Most clauses should be false.
- Set "concern": false for standard, low-risk, or routine clauses.
- If the page is not a legal/privacy document, return a single card explaining what the page is about with "concern": false.
- Respond with the JSON array only — nothing else.`;

// Tracks the last URL per tab where highlight CSS was injected.
// Keyed by tabId so navigation (URL change) triggers re-injection.
const cssInjectedForUrl = new Map<number, string>();

async function sendHighlightToTab(text: string): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const url = tab.url ?? '';
    // chrome.scripting.insertCSS bypasses the page's Content-Security-Policy,
    // unlike a <style> element injected by the content script which CSP can block.
    if (cssInjectedForUrl.get(tab.id) !== url) {
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        css: '::highlight(readibly-highlight) { background-color: rgba(251, 210, 42, 0.45); color: inherit; }'
      });
      cssInjectedForUrl.set(tab.id, url);
    }
    await chrome.tabs.sendMessage(tab.id, { type: 'READIBLY_HIGHLIGHT_TEXT', text } satisfies HighlightTextMessage);
  } catch {
    // Silently ignore — page may not have a content script.
  }
}

async function sendClearHighlightsToTab(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, { type: 'READIBLY_CLEAR_HIGHLIGHTS' } satisfies ClearHighlightsMessage);
    }
  } catch {
    // Silently ignore.
  }
}


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

      const effectiveApiKey = (import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined) || '';
      if (effectiveApiKey) {
        setStatusText('Analyzing with Claude AI…');
        try {
          const cards = await generateSummaryCards(effectiveApiKey, result);
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
              {activeTab === 'settings' ? (
                <SettingsPage />
              ) : viewState !== 'summary' ? (
                <OnboardingSection onScan={handleScan} statusText={statusText} scanning={viewState === 'scanning'} />
              ) : activeTab === 'chat' ? (
                <ChatPage result={scanResult} showCitations={settings.showCitations} />
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
          icon={<YieldIcon className="feature-card__svg" />}
          iconStyle={{ background: '#fef9c3', color: '#92400e' }}
          title="Disclaimer"
          description="AI summaries may contain errors and are not legal advice. Review the original document and consult a lawyer for important decisions."
        />
        <FeatureCard
          icon={<ShieldIcon className="feature-card__svg" />}
          title="Private & Secure"
          description="Page content is only sent to Anthropic's API and never to third parties."
        />
        <FeatureCard
          icon={<LockIcon className="feature-card__svg" />}
          title="AI-Powered Analysis"
          description="Claude reads the full page context and flags the clauses that matter most to you."
        />
      </div>

      <footer className="onboarding__footer">
        <div className="footer-kicker"></div>
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
  const [pinnedSource, setPinnedSource] = useState<string | null>(null);
  const hoverSourceRef = useRef<string | null>(null);

  const fallbackCards: SummaryCard[] = EXAMPLE_CARDS;

  // Prefer AI-generated cards, fall back to example cards
  const displayCards: SummaryCard[] = generatedCards ?? fallbackCards;

  const warningTerms = settings.customWarningTerms.map((t) => t.toLowerCase());

  const getCardBadge = (card: SummaryCard): { type: 'flag'; reason: string } | { type: 'concern' } | null => {
    const hay = `${card.title} ${card.body}`.toLowerCase();
    for (const cat of settings.warningCategories) {
      const keywords = [...(CATEGORY_KEYWORDS[cat] ?? []), cat.toLowerCase()];
      if (keywords.some((kw) => hay.includes(kw))) return { type: 'flag', reason: cat };
    }
    for (const t of warningTerms) {
      if (t.length > 0 && hay.includes(t)) return { type: 'flag', reason: `"${t}"` };
    }
    if (card.concern) return { type: 'concern' };
    return null;
  };

  const aiMode = !!generatedCards;

  // Clear page highlight whenever this view unmounts (tab switch or rescan).
  useEffect(() => () => { void sendClearHighlightsToTab(); }, []);

  const handleMouseEnter = (source: string) => {
    hoverSourceRef.current = source;
    if (!pinnedSource) void sendHighlightToTab(source);
  };

  const handleMouseLeave = () => {
    hoverSourceRef.current = null;
    if (!pinnedSource) void sendClearHighlightsToTab();
  };

  const handleClick = (source: string) => {
    if (pinnedSource === source) {
      // Toggle off — restore hover highlight or clear entirely.
      setPinnedSource(null);
      if (hoverSourceRef.current) {
        void sendHighlightToTab(hoverSourceRef.current);
      } else {
        void sendClearHighlightsToTab();
      }
    } else {
      // Switch pin to this card.
      setPinnedSource(source);
      void sendHighlightToTab(source);
    }
  };

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
              : (scanError ? 'Fallback mode' : 'No API Key')
            : 'Example'}
        </div>
      </div>

      <p className="summary-disclaimer">AI may miss clauses or contain errors. This is not legal advice. Please consult a lawyer for important decisions.</p>

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
              <div className="summary-card__badge-slot">
                {(() => {
                  const badge = getCardBadge(card);
                  if (!badge) return null;
                  if (badge.type === 'flag') return (
                    <span className="summary-card__flag" data-tooltip={badge.reason}><span>🚩</span>Flag</span>
                  );
                  return (
                    <span className="summary-card__concern" data-tooltip="May Be of Concern"><span>⚠️</span>Caution</span>
                  );
                })()}
              </div>
            </div>
            <p>{card.body}</p>
          </Surface>
        ))}
      </div>
    </section>
  );
}