import { useRef, useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "./ui/Card";
import { Button } from "./ui/Button";
import { cn } from "../lib/cn";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "If I traded away my 4th and want to keep Olave, what round does he cost?",
  "How many years can I keep the same player?",
  "What's the cost to keep 4 keepers?",
  "Do I pay the insurance fee if I trade multiple picks?",
];

export function RulesChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = async (text: string) => {
    const candidate = text.trim();
    if (!candidate || busy) return;
    setError(null);
    setInput("");
    const history = [...messages, { role: "user", content: candidate } as Message];
    setMessages([...history, { role: "assistant", content: "" }]);
    setBusy(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/rules-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: acc };
          return next;
        });
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") setError(e.message ?? String(e));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  return (
    <Card className="not-prose">
      <CardHeader>
        <CardTitle>Ask the rulebook</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-ink-600">
              Type a question or pick one to start:
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-ink-200 bg-ink-50 px-3 py-1 text-xs text-ink-700 hover:bg-ink-100"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.length > 0 && (
          <div className="space-y-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm",
                  m.role === "user"
                    ? "ml-8 bg-brand-50 text-brand-900"
                    : "mr-8 bg-ink-50 text-ink-900",
                )}
              >
                {m.content || (
                  <span className="text-ink-400">
                    {busy && i === messages.length - 1 ? "Thinking…" : ""}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-red-700">{error}</p>}

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about a rule…"
            className="flex-1 rounded-md border border-ink-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            disabled={busy}
          />
          <Button type="submit" disabled={busy || !input.trim()}>
            {busy ? "…" : "Send"}
          </Button>
          {messages.length > 0 && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                abortRef.current?.abort();
                setMessages([]);
                setError(null);
              }}
            >
              Clear
            </Button>
          )}
        </form>
      </CardBody>
    </Card>
  );
}
