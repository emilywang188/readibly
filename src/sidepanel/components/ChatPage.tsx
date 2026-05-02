import Anthropic from '@anthropic-ai/sdk';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ANTHROPIC_API_KEY, CLAUDE_MODEL } from '../../shared/config';
import type { ScanResult } from '../../shared/types';
import { Surface } from './Surface';

// Renders **bold** and *italic* markdown inline — no library needed.
function renderMarkdown(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

type ChatPageProps = {
  result: ScanResult | null;
  showCitations?: boolean;
};

type ChatRole = 'assistant' | 'user';

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  showDisclaimer?: boolean;
};

const quickPrompts = [
  'What are the biggest risks?',
  'Summarize cancellation terms',
  'What should I verify before agreeing?'
];

function buildSystemText(result: ScanResult, showCitations: boolean): string {
  const highlightText = result.cards.map((h) => `${h.title}: ${h.body}`).join('\n');


  return `You are Readibly, a legal document assistant embedded in a browser extension. Answer questions about the following agreement concisely and clearly, flagging risks where relevant. Keep answers to 2-4 sentences unless a longer answer is clearly needed.

${showCitations ? 'When supporting your answer, quote the exact language from the document verbatim, using quotation marks.' : ''}

Important: You are not a lawyer and this is not legal advice. Periodically remind the user throughout the conversation that your analysis may be incomplete or incorrect, and that they should consult a lawyer for important decisions.

Only answer questions directly related to this document or to legal/privacy matters relevant to it. If the question is unrelated, respond only with: "I'm sorry, I can't answer that. It is beyond the scope of my functionality."


Document: ${result.page.title}
URL: ${result.page.url}

Document text:
${result.page.excerpt.slice(0, 8000)}

Analysis highlights:
${highlightText}`;
}

export function ChatPage({ result, showCitations = false }: ChatPageProps) {
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
        system: [{ type: 'text', text: buildSystemText(result, showCitations), cache_control: { type: 'ephemeral' } }],
        messages: apiMessages
      });

      stream.on('text', (chunk: string) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, text: m.text + chunk } : m))
        );
      });

      await stream.finalMessage();
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, showDisclaimer: true } : m))
      );
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
        <div className="summary-meta">{isTyping ? 'Thinking…' : 'Claude AI'}</div>
      </div>

      <p className="chat-header-disclaimer">⚠ AI-generated — not legal advice.</p>

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
            {message.role === 'assistant'
              ? renderMarkdown(message.text || (isTyping ? '…' : ''))
              : message.text}
            {message.showDisclaimer && (
              <em className="chat-disclaimer">Please note: I'm not a lawyer, and this is not legal advice. For important decisions, consult a qualified attorney.</em>
            )}
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
