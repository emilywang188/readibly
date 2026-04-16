import type {
  ClearHighlightsMessage,
  CollectPageContextMessage,
  HighlightTextMessage,
  PageSnapshot,
  ScanResult
} from '../shared/types';

// Inject highlight styles for the CSS Custom Highlight API once.
const _style = document.createElement('style');
_style.textContent = `::highlight(readibly-highlight) { background-color: rgba(251, 210, 42, 0.45); }`;
(document.head ?? document.documentElement).appendChild(_style);

chrome.runtime.onMessage.addListener(
  (
    message: CollectPageContextMessage | HighlightTextMessage | ClearHighlightsMessage,
    _sender,
    sendResponse
  ): boolean => {
    switch (message.type) {
      case 'READIBLY_COLLECT_PAGE_CONTEXT': {
        const page = collectPageSnapshot();
        const result: ScanResult = {
          status: 'complete',
          generatedAt: Date.now(),
          page,
          cards: buildHighlights(page)
        };
        sendResponse(result);
        return false;
      }

      case 'READIBLY_HIGHLIGHT_TEXT': {
        highlightText((message as HighlightTextMessage).text);
        sendResponse({ ok: true });
        return false;
      }

      case 'READIBLY_CLEAR_HIGHLIGHTS': {
        clearHighlights();
        sendResponse({ ok: true });
        return false;
      }

      default:
        return false;
    }
  }
);

function collectPageSnapshot(): PageSnapshot {
  const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
    .map((node) => node.textContent?.trim())
    .filter((value): value is string => Boolean(value))
    .slice(0, 6);

  const bodyText = document.body?.innerText?.replace(/\s+/g, ' ').trim() ?? '';
  const selection = window.getSelection()?.toString().trim() ?? '';

  return {
    title: document.title || 'Untitled document',
    url: location.href,
    hostname: location.hostname || 'local-session',
    selection,
    excerpt: bodyText.slice(0, 15000) || 'No visible text was detected on this page.',
    headings
  };
}

function buildHighlights(page: PageSnapshot): ScanResult['cards'] {
  return [
    {
      title: 'Document tone',
      body: page.headings.length > 0 ? `Detected ${page.headings.length} prominent section anchors.` : 'No obvious section hierarchy detected.'
    },
    {
      title: 'Readable excerpt',
      body: page.excerpt
    },
    {
      title: 'Local-first scan',
      body: 'Analysis is scoped to the browser session and can be expanded into clause-level guidance later.'
    }
  ];
}

// ---------------------------------------------------------------------------
// Highlight helpers
// ---------------------------------------------------------------------------

function highlightText(searchText: string): void {
  clearHighlights();
  if (!searchText || searchText.length < 8) return;

  const lowerSearch = searchText.toLowerCase().replace(/\s+/g, ' ').trim();
  let firstNode: Node | null = null;

  if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
    // CSS Custom Highlight API (Chrome 105+) — no DOM mutation.
    const highlight = new Highlight();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

    let node: Node | null;
    while ((node = walker.nextNode())) {
      const raw = node.textContent ?? '';
      const text = raw.toLowerCase().replace(/\s+/g, ' ');
      let start = 0;
      let idx: number;
      while ((idx = text.indexOf(lowerSearch, start)) !== -1) {
        const range = new Range();
        range.setStart(node, idx);
        range.setEnd(node, idx + searchText.length);
        highlight.add(range);
        if (!firstNode) firstNode = node;
        start = idx + 1;
      }
    }

    if (highlight.size > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (CSS as any).highlights.set('readibly-highlight', highlight);
      (firstNode as Text | null)?.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

function clearHighlights(): void {
  if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (CSS as any).highlights.delete('readibly-highlight');
  }
}
