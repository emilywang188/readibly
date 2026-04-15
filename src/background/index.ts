import type { ClosePanelMessage, CollectPageContextMessage, RuntimeMessage, ScanResult } from '../shared/types';

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
      const result = response as ScanResult;
      return {
        ...result,
        generatedAt: Date.now(),
        status: 'complete'
      };
    }
  } catch {
    // Fall through to fallback result.
  }

  return buildFallbackResult(activeTab.title ?? 'Untitled page');
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
      excerpt: 'Readibly could not access the page directly, so this is a preview from the active tab context.',
      headings: []
    },
    highlights: [
      {
        title: 'Overview',
        body: 'This is a placeholder scan summary. The final implementation can map contract clauses into structured language.'
      },
      {
        title: 'Privacy',
        body: 'Local-first processing keeps analysis inside the browser environment.'
      },
      {
        title: 'Next step',
        body: 'Wire the parser to clause detection, risk scoring, and comparison modes.'
      }
    ]
  };
}

function handleClosePanel(_message: ClosePanelMessage) {
  // The Chrome side panel API does not expose a direct close command from the
  // panel itself, so this remains a placeholder hook for future behavior.
}
