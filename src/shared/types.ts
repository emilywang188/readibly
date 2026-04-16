export type PanelTab = 'summary' | 'chat' | 'settings';

export interface PageSnapshot {
  title: string;
  url: string;
  hostname: string;
  selection: string;
  excerpt: string;
  headings: string[];
}

export interface SummaryCard {
  title: string;
  body: string;
  /** Short verbatim quote from the source document used for hover-highlighting. */
  source?: string;
}

export interface ScanResult {
  status: 'complete';
  page: PageSnapshot;
  generatedAt: number;
  cards: SummaryCard[];
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

export interface HighlightTextMessage {
  type: 'READIBLY_HIGHLIGHT_TEXT';
  text: string;
}

export interface ClearHighlightsMessage {
  type: 'READIBLY_CLEAR_HIGHLIGHTS';
}

export type RuntimeMessage =
  | ScanRequestMessage
  | CollectPageContextMessage
  | ClosePanelMessage
  | HighlightTextMessage
  | ClearHighlightsMessage;
