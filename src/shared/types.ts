export type PanelTab = 'summary' | 'chat' | 'settings';

export interface PageSnapshot {
  title: string;
  url: string;
  hostname: string;
  selection: string;
  excerpt: string;
  headings: string[];
}

export interface ScanSection {
  title: string;
  body: string;
}

export interface ScanResult {
  status: 'complete';
  page: PageSnapshot;
  generatedAt: number;
  highlights: ScanSection[];
}

export interface ScanRequestMessage {
  type: 'READIBLY_SCAN_REQUEST';
}

export interface CollectPageContextMessage {
  type: 'READIBLY_COLLECT_PAGE_CONTEXT';
}

export interface ClosePanelMessage {
  type: 'READIBLY_CLOSE_PANEL';
}

export type RuntimeMessage = ScanRequestMessage | CollectPageContextMessage | ClosePanelMessage;
