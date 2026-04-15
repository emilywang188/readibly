import type { RuntimeMessage, ScanResult } from './types';

export const messageTypes = {
  scanRequest: 'READIBLY_SCAN_REQUEST',
  collectPageContext: 'READIBLY_COLLECT_PAGE_CONTEXT',
  closePanel: 'READIBLY_CLOSE_PANEL'
} as const;

export function sendRuntimeMessage<TResponse>(message: RuntimeMessage) {
  return chrome.runtime.sendMessage(message) as Promise<TResponse>;
}

export function isScanResult(value: unknown): value is ScanResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ScanResult>;
  return candidate.status === 'complete' && typeof candidate.generatedAt === 'number';
}
