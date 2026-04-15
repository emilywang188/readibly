import Anthropic from '@anthropic-ai/sdk';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ANTHROPIC_API_KEY, CLAUDE_MODEL } from '../../shared/config';
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

function buildSystemText(result: ScanResult): string {
  const highlightText = result.cards.map((h) => `${h.title}: ${h.body}`).join('\n');

  return `You are Readibly, a legal document assistant embedded in a browser extension. Answer questions about the following agreement concisely and clearly, flagging risks where relevant. Cite specific language from the document when possible. Keep answers to 2-4 sentences unless a longer answer is clearly needed.

Document: ${result.page.title}
URL: ${result.page.url}

Document text:
${result.page.excerpt.slice(0, 8000)}

Analysis highlights:
${highlightText}`;
}

export function ChatPage({ result }: ChatPageProps) {
  const starter = useMemo<ChatMessage[]>(
    () => [
      {
        id: 'assistant-initial',
        role: 'assistant',
        text: result
          ? `I scanned "${result.page.title}". Ask about risk, obligations, payment language, or privacy clauses.`
          : 'Scan a page first, then I can answer follow-up questions about obligations and legal risk.'
      }
    ],
    [result]
  );

  const [messages, setMessages] = useState<ChatMessage[]>(starter);
  const [draft, setDraft] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;

    const userMsg: ChatMessage = {
      id: `user-${crypto.randomUUID()}`,
      role: 'user',
      text: trimmed
    };
    const assistantId = `assistant-${crypto.randomUUID()}`;

    const history = messages.filter((m) => m.id !== 'assistant-initial');
    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: 'assistant', text: '' }]);
    setDraft('');
    setIsTyping(true);

    if (!result) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, text: 'Please scan a page first before asking questions.' } : m
        )
      );
      setIsTyping(false);
      return;
    }

    if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'PASTE_YOUR_KEY_HERE') {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, text: 'Add your Anthropic API key to .env to enable chat.' }
            : m
        )
      );
      setIsTyping(false);
      return;
    }

    try {
      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY, dangerouslyAllowBrowser: true });

      const apiMessages = [...history, userMsg].map((m) => ({
        role: m.role,
        content: m.text
      }));

      const stream = client.messages.stream({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        system: [{ type: 'text', text: buildSystemText(result), cache_control: { type: 'ephemeral' } }],
        messages: apiMessages
      });

      stream.on('text', (chunk: string) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, text: m.text + chunk } : m))
        );
      });

      await stream.finalMessage();
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, text: 'Something went wrong. Check your API key in .env.' } : m
        )
      );
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <section className="chat-view">
      <div className="summary-header">
        <div>
          <div className="eyebrow">Conversation</div>
          <h2>Ask about this agreement</h2>
        </div>
        <div className="summary-meta">{isTyping ? 'Thinking…' : 'Claude'}</div>
      </div>

      <div className="chat-quick-row">
        {quickPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="chat-quick-chip"
            onClick={() => void sendMessage(prompt)}
            disabled={isTyping}
          >
            {prompt}
          </button>
        ))}
      </div>

      <Surface ref={threadRef} tone="white" className="chat-thread" role="log" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className={`chat-bubble chat-bubble--${message.role}`}>
            {message.text || (message.role === 'assistant' && isTyping ? '…' : '')}
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
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void sendMessage(draft);
            }
          }}
          placeholder="Ask a follow-up question…"
          rows={2}
          className="chat-input"
          disabled={isTyping}
        />
        <button type="submit" className="chat-send-button" disabled={!draft.trim() || isTyping}>
          Send
        </button>
      </form>
    </section>
  );
}
