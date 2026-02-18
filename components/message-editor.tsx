'use client';

import { useEffect, useRef, useState } from 'react';
import type { UseChatHelpers } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { deleteTrailingMessages } from '@/app/(chat)/actions';
import { ArrowUpIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type Props = {
  message: UIMessage;
  setMode: (mode: 'view' | 'edit') => void;
  setMessages: UseChatHelpers<UIMessage>['setMessages'];
  regenerate: UseChatHelpers<UIMessage>['regenerate'];
};

function extractText(message: UIMessage): string {
  return message.parts
    .filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

export function MessageEditor({
  message,
  setMode,
  setMessages,
  regenerate,
}: Props) {
  const [draft, setDraft] = useState(extractText(message));
  const [submitting, setSubmitting] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 300)}px`;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }, []);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text) return;
    setSubmitting(true);
    await deleteTrailingMessages({ id: message.id });
    setMessages((msgs) => {
      const idx = msgs.findIndex((m) => m.id === message.id);
      if (idx === -1) return msgs;
      return [
        ...msgs.slice(0, idx),
        { ...message, parts: [{ type: 'text', text }] },
      ];
    });
    setMode('view');
    regenerate();
  };

  return (
    <div className="flex w-full flex-col items-end gap-1">
      <div className="min-w-0 w-full rounded-lg bg-secondary p-2 shadow-sm ring-1 ring-border/50">
        <Textarea
          ref={ref}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            const ta = e.currentTarget;
            ta.style.height = 'auto';
            ta.style.height = `${Math.min(ta.scrollHeight, 300)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
            if (e.key === 'Escape') {
              setMode('view');
            }
          }}
          className="max-h-[300px] min-h-0 w-full resize-none border-0 bg-transparent p-0 text-base leading-relaxed shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          rows={1}
        />
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          onClick={() => setMode('view')}
          disabled={submitting}
          title="Отмена"
        >
          <XIcon className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          disabled={submitting || !draft.trim()}
          onClick={() => void handleSend()}
          title="Отправить"
        >
          <ArrowUpIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
