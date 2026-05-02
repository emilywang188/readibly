export const warningCategoryOptions = [
  'Data Collection',
  'Location Access',
  'Third-Party Sharing',
  'Ownership of Content',
  'Auto-Renewal'
] as const;

export type WarningCategory = (typeof warningCategoryOptions)[number];

export type ReadiblySettings = {
  autoScanOnOpen: boolean;
  showClauseHighlights: boolean;
  showCitations: boolean;
  warningCategories: WarningCategory[];
  customWarningTerms: string[];
};

export const settingsStorageKey = 'readibly.settings.v2';

export const defaultReadiblySettings: ReadiblySettings = {
  autoScanOnOpen: false,
  showClauseHighlights: true,
  showCitations: true,
  warningCategories: ['Data Collection', 'Third-Party Sharing', 'Dispute Resolution'],
  customWarningTerms: []
};