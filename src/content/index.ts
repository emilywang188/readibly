import type {
  ClearHighlightsMessage,
  CollectPageContextMessage,
  HighlightTextMessage,
  PageSnapshot,
  ScanResult
} from '../shared/types';

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

// Tags whose text content is never visible — mirrors innerText behaviour.
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'MATH']);

// Block-level tags after which innerText inserts a newline.
const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT',
  'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3',
  'H4', 'H5', 'H6', 'HEADER', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE',
  'SECTION', 'SUMMARY', 'TABLE', 'TD', 'TH', 'TR', 'UL'
]);

function isInSkippedElement(node: Node): boolean {
  let el = node.parentElement;
  while (el) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    el = el.parentElement;
  }
  return false;
}

function nearestBlock(node: Node): Element {
  let el = node.parentElement;
  while (el && el !== document.body) {
    if (BLOCK_TAGS.has(el.tagName)) return el;
    el = el.parentElement;
  }
  return document.body;
}

function highlightText(searchText: string): void {
  clearHighlights();
  if (!searchText || searchText.length < 8) return;
  if (typeof CSS === 'undefined' || !('highlights' in CSS)) return;

  const query = searchText.toLowerCase().replace(/\s+/g, ' ').trim();

  // Build a virtual text that mirrors innerText as closely as possible:
  // • skip script/style/hidden elements
  // • insert a synthetic space at block-element boundaries
  // Track each character's origin (node + rawOffset) for Range creation.
  // Synthetic boundary spaces use a null sentinel in posMap.
  type Pos = { node: Node; rawOffset: number };
  const posMap: Array<Pos | null> = [];
  let virtualText = '';
  let prevWasSpace = true;
  let lastBlock: Element = document.body;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let textNode: Node | null;

  while ((textNode = walker.nextNode())) {
    if (isInSkippedElement(textNode)) continue;

    // Insert a separator when crossing a block boundary (mirrors innerText \n).
    const thisBlock = nearestBlock(textNode);
    if (thisBlock !== lastBlock && !prevWasSpace) {
      posMap.push(null);
      virtualText += ' ';
      prevWasSpace = true;
    }
    lastBlock = thisBlock;

    const raw = textNode.textContent ?? '';
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (/\s/.test(ch)) {
        if (!prevWasSpace) {
          posMap.push({ node: textNode, rawOffset: i });
          virtualText += ' ';
          prevWasSpace = true;
        }
      } else {
        posMap.push({ node: textNode, rawOffset: i });
        virtualText += ch.toLowerCase();
        prevWasSpace = false;
      }
    }
  }

  // CSS Custom Highlight API (Chrome 105+) — no DOM mutation.
  const highlight = new Highlight();
  let firstRange: Range | null = null;
  let searchFrom = 0;

  while (searchFrom < virtualText.length) {
    const start = virtualText.indexOf(query, searchFrom);
    if (start === -1) break;
    const end = start + query.length;
    if (end > posMap.length) break;

    // Expand the matched phrase to ~3 surrounding sentences.
    let chunkStart = start;
    for (let i = start - 1; i >= 0; i--) {
      if ('.?!'.includes(virtualText[i])) {
        chunkStart = i + 1;
        while (chunkStart < start && virtualText[chunkStart] === ' ') chunkStart++;
        break;
      }
    }
    let chunkEnd = end;
    let sentenceCount = 0;
    for (let i = end; i < virtualText.length && sentenceCount < 2; i++) {
      if ('.?!'.includes(virtualText[i])) { sentenceCount++; chunkEnd = i + 1; }
    }

    // Map expanded positions to DOM nodes, falling back to the exact match.
    let si = chunkStart;
    while (si < start && posMap[si] === null) si++;
    let ei = Math.min(chunkEnd - 1, posMap.length - 1);
    while (ei > end - 1 && posMap[ei] === null) ei--;

    const startPos = posMap[si] ?? posMap[start];
    const endPos = posMap[ei] ?? posMap[end - 1];

    if (startPos && endPos) {
      const range = new Range();
      range.setStart(startPos.node, startPos.rawOffset);
      range.setEnd(endPos.node, endPos.rawOffset + 1);
      highlight.add(range);
      if (!firstRange) firstRange = range;
    }
    searchFrom = start + 1;
  }

  if (highlight.size > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (CSS as any).highlights.set('readibly-highlight', highlight);
    firstRange?.startContainer.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function clearHighlights(): void {
  if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (CSS as any).highlights.delete('readibly-highlight');
  }
}
