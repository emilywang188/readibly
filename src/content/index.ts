import type { CollectPageContextMessage, PageSnapshot, ScanResult } from '../shared/types';

chrome.runtime.onMessage.addListener(
  (message: CollectPageContextMessage, _sender, sendResponse): boolean => {
    if (message.type !== 'READIBLY_COLLECT_PAGE_CONTEXT') {
      return false;
    }

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
