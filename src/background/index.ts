import Anthropic from '@anthropic-ai/sdk';
import type {
  ClosePanelMessage,
  CollectPageContextMessage,
  PageSnapshot,
  RuntimeMessage,
  ScanResult,
  SummaryCard
} from '../shared/types';
import { ANTHROPIC_API_KEY, CLAUDE_MODEL } from '../shared/config';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    // Side panel behavior is best-effort in older environments.
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.type === 'READIBLY_SCAN_REQUEST') {
    void handleScanRequest().then((result) => sendResponse(result));
    return true;
  }

  if (message.type === 'READIBLY_CLOSE_PANEL') {
    void handleClosePanel(message);
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'READIBLY_COLLECT_PAGE_CONTEXT') {
    sendResponse({ ok: false });
    return false;
  }

  return false;
});

async function handleScanRequest(): Promise<ScanResult> {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!activeTab?.id) {
    return buildFallbackResult('No active tab detected.');
  }

  try {
    const response = await chrome.tabs.sendMessage(
      activeTab.id,
      { type: 'READIBLY_COLLECT_PAGE_CONTEXT' } satisfies CollectPageContextMessage
    );

    if (response && typeof response === 'object' && 'page' in response) {
      const scanResult = response as ScanResult;
      const cards = await analyzeWithClaude(scanResult.page);
      return {
        status: 'complete',
        generatedAt: Date.now(),
        page: scanResult.page,
        cards: cards
      };
    }
  } catch {
    // Fall through to fallback result.
  }

  return buildFallbackResult(activeTab.title ?? 'Untitled page');
}

async function analyzeWithClaude(page: PageSnapshot): Promise<SummaryCard[]> {
  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'PASTE_YOUR_KEY_HERE') {
    return buildFallbackHighlights(page);
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const systemPrompt = `You are a legal document analyst embedded in a browser extension called Readibly. The user has provided text from a Terms & Conditions, Privacy Policy, or similar agreement. Extract the most important clauses and produce a structured JSON summary.

Return ONLY valid JSON with no markdown fences, matching this schema exactly:
{"highlights":[{"title":"string","body":"string"}]}`;

  const userPrompt = `Analyze this agreement from ${page.hostname}:

Title: ${page.title}
URL: ${page.url}

Document text:
${page.excerpt}

Return 4-6 highlights covering the most important topics from: data collection/sharing, payment/billing, auto-renewal, liability limits, arbitration/dispute resolution, account termination, and unusually broad rights granted to the provider. Be specific — paraphrase actual language from the document. Keep each body to 1-3 sentences. Return JSON only.`;

  try {
    const stream = client.messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const msg = await stream.finalMessage();
    const text = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : '';
    const parsed = JSON.parse(text) as { highlights: SummaryCard[] };

    if (Array.isArray(parsed.highlights) && parsed.highlights.length > 0) {
      return parsed.highlights;
    }
  } catch {
    // Fall through to local fallback.
  }

  return buildFallbackHighlights(page);
}

function buildFallbackHighlights(page: PageSnapshot): SummaryCard[] {
  return [
    {
      title: 'Document overview',
      body: page.headings.length > 0
        ? `Detected ${page.headings.length} section headings: ${page.headings.slice(0, 3).join(', ')}.`
        : 'No section hierarchy detected. The document may be unstructured.'
    },
    {
      title: 'Excerpt',
      body: page.excerpt.slice(0, 300)
    },
    {
      title: 'Analysis unavailable',
      body: 'Add your Anthropic API key to .env to enable AI-powered clause analysis.'
    }
  ];
}

function buildFallbackResult(sourceLabel: string): ScanResult {
  return {
    status: 'complete',
    generatedAt: Date.now(),
    page: {
      title: sourceLabel,
      url: '',
      hostname: 'local-session',
      selection: '',
      excerpt: 'Readibly could not access the page directly.',
      headings: []
    },
    cards: [
      {
        title: 'Unable to scan',
        body: 'Readibly could not access the active tab. Navigate to the page you want to analyze and try again.'
      }
    ]
  };
}

function handleClosePanel(_message: ClosePanelMessage) {
  // The Chrome side panel API does not expose a direct close command from the
  // panel itself, so this remains a placeholder hook for future behavior.
}
