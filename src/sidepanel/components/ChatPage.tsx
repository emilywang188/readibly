import { useMemo, useRef, useEffect, useState } from 'react';
import type { ScanResult } from '../../shared/types';
import { Surface } from './Surface';

type ChatPageProps = {
  result: ScanResult | null;
  apiKey: string;
};

type ChatRole = 'assistant' | 'user';

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  loading?: boolean;
};

const quickPrompts = [
  'What are the biggest risks?',
  'Summarize cancellation terms',
  'What should I verify before agreeing?'
];

const CHAT_SYSTEM = (result: ScanResult) =>
  `You are Readibly, an AI legal assistant embedded in a Chrome extension. You have already scanned the following page:

Title: ${result.page.title}
URL: ${result.page.url || '(not available)'}
Page excerpt: ${result.page.excerpt}
${result.cards ? `\nAI-generated summary cards:\n${result.cards.map((c) => `- ${c.title}: ${c.body}`).join('\n')}` : ''}

Help the user understand this document. Be concise (2–4 sentences per answer). Clearly flag risks. Never give formal legal advice — remind the user to consult a lawyer for decisions.`;

async function callClaude(
  apiKey: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  system: string
): Promise<string> {
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
      max_tokens: 512,
      system,
      messages
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }

  const data = await res.json() as { content: Array<{ type: string; text: string }> };
  return data.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

export function ChatPage({ result, apiKey }: ChatPageProps) {
  const starter = useMemo<ChatMessage[]>(
    () => [
      {
        id: 'assistant-initial',
        role: 'assistant',
        text: result
          ? `I've analyzed "${result.page.title}". Ask me about risks, obligations, payment terms, privacy clauses, or anything else in this document.`
          : 'Scan a page first, then I can answer detailed questions about the agreement.'
      }
    ],
    [result]
  );

  const [messages, setMessages] = useState<ChatMessage[]>(starter);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    const userMsg: ChatMessage = { id: `user-${crypto.randomUUID()}`, role: 'user', text: trimmed };
    const loadingMsg: ChatMessage = { id: `loading-${crypto.randomUUID()}`, role: 'assistant', text: '…', loading: true };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setDraft('');
    setBusy(true);

    try {
      if (!apiKey) {
        throw new Error('No API key — add your Claude API key in Settings.');
      }
      if (!result) {
        throw new Error('No page scanned yet. Click "Scan this page" first.');
      }

      // Build conversation history (exclude loading messages)
      const history = [...messages, userMsg]
        .filter((m) => !m.loading)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.text }));

      const reply = await callClaude(apiKey, history, CHAT_SYSTEM(result));

      setMessages((prev) =>
        prev.map((m) => (m.loading ? { ...m, text: reply, loading: false } : m))
      );
    } catch (err) {
      const errorText = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setMessages((prev) =>
        prev.map((m) => (m.loading ? { ...m, text: `⚠ ${errorText}`, loading: false } : m))
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="chat-view">
      <div className="summary-header">
        <div>
          <h2>Ask about this page</h2>
        </div>
        <div className="summary-meta">{apiKey ? 'Claude AI' : 'No API key'}</div>
      </div>

      <div className="chat-quick-row">
        {quickPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="chat-quick-chip"
            onClick={() => void sendMessage(prompt)}
            disabled={busy}
          >
            {prompt}
          </button>
        ))}
      </div>

      <Surface tone="white" className="chat-thread" role="log" aria-live="polite" ref={threadRef}>
        {messages.map((message) => (
          <div
            key={message.id}
            className={`chat-bubble chat-bubble--${message.role} ${message.loading ? 'chat-bubble--loading' : ''}`.trim()}
          >
            {message.text}
          </div>
        ))}
      </Surface>

      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage(draft);
        }}
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void sendMessage(draft);
            }
          }}
          placeholder={apiKey ? 'Ask a follow-up question…' : 'Add your API key in Settings to chat'}
          rows={2}
          className="chat-input"
          disabled={busy}
        />
        <button type="submit" className="chat-send-button" disabled={!draft.trim() || busy}>
          {busy ? '…' : 'Send'}
        </button>
      </form>
    </section>
  );
}