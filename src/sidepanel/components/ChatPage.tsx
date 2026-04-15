import { useMemo, useState } from 'react';
import type { ScanResult } from '../../shared/types';
import { Surface } from './Surface';

type ChatPageProps = {
  result: ScanResult | null;
};

type ChatRole = 'assistant' | 'user';

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
};

const quickPrompts = [
  'What are the biggest risks?',
  'Summarize cancellation terms',
  'What should I verify before agreeing?'
];

export function ChatPage({ result }: ChatPageProps) {
  const starter = useMemo<ChatMessage[]>(
    () => [
      {
        id: 'assistant-initial',
        role: 'assistant',
        text: result
          ? `I scanned “${result.page.title}”. Ask about risk, obligations, payment language, or privacy clauses.`
          : 'Scan a page first, then I can answer follow-up questions about obligations and legal risk.'
      }
    ],
    [result]
  );

  const [messages, setMessages] = useState<ChatMessage[]>(starter);
  const [draft, setDraft] = useState('');

  const sendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMessage: ChatMessage = {
      id: `user-${crypto.randomUUID()}`,
      role: 'user',
      text: trimmed
    };

    const assistantMessage: ChatMessage = {
      id: `assistant-${crypto.randomUUID()}`,
      role: 'assistant',
      text: buildAssistantReply(trimmed, result)
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setDraft('');
  };

  return (
    <section className="chat-view">
      <div className="summary-header">
        <div>
          <div className="eyebrow">Conversation</div>
          <h2>Ask about this agreement</h2>
        </div>
        <div className="summary-meta">Local mode</div>
      </div>

      <div className="chat-quick-row">
        {quickPrompts.map((prompt) => (
          <button key={prompt} type="button" className="chat-quick-chip" onClick={() => sendMessage(prompt)}>
            {prompt}
          </button>
        ))}
      </div>

      <Surface tone="white" className="chat-thread" role="log" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className={`chat-bubble chat-bubble--${message.role}`}>
            {message.text}
          </div>
        ))}
      </Surface>

      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          sendMessage(draft);
        }}
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask a follow-up question…"
          rows={2}
          className="chat-input"
        />
        <button type="submit" className="chat-send-button" disabled={!draft.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}

function buildAssistantReply(prompt: string, result: ScanResult | null) {
  const lower = prompt.toLowerCase();
  const firstHighlight = result?.highlights[0]?.body;
  const secondHighlight = result?.highlights[1]?.body;

  if (lower.includes('risk')) {
    return firstHighlight
      ? `Top risk signal: ${firstHighlight} Verify cancellation, liability limits, and unilateral update clauses before accepting.`
      : 'Top risk signal: verify liability limits, auto-renewal terms, and any broad rights granted to the provider.';
  }

  if (lower.includes('cancel')) {
    return 'I did not find explicit cancellation parsing yet. Check notice period, refund language, and auto-renew clauses before agreeing.';
  }

  if (lower.includes('verify') || lower.includes('before agreeing')) {
    return 'Before agreeing, confirm payment triggers, termination rights, privacy/data use clauses, and governing law or arbitration terms.';
  }

  if (lower.includes('summary') || lower.includes('summarize')) {
    return secondHighlight
      ? `Quick summary: ${secondHighlight}`
      : 'Quick summary: this document can be simplified into obligations, restrictions, and risk-sensitive terms.';
  }

  return 'Got it. I can break this down by obligations, data use, payment, termination, and dispute language if you want a section-by-section review.';
}
