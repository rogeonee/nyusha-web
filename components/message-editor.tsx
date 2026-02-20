'use client';

import { useEffect, useRef, useState } from 'react';
import type { UseChatHelpers } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { deleteTrailingMessages } from '@/app/(chat)/actions';
import { ArrowUpIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type Props<UI_MESSAGE extends UIMessage> = {
  message: UI_MESSAGE;
  setMode: (mode: 'view' | 'edit') => void;
  setMessages: UseChatHelpers<UI_MESSAGE>['setMessages'];
  regenerate: UseChatHelpers<UI_MESSAGE>['regenerate'];
};

function extractText(message: UIMessage): string {
  return message.parts
    .filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

export function MessageEditor<UI_MESSAGE extends UIMessage>({
  message,
  setMode,
  setMessages,
  regenerate,
}: Props<UI_MESSAGE>) {
  const [draft, setDraft] = useState(extractText(message));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const offlineMessage =
    'Нет подключения к интернету. Проверьте соединение и попробуйте снова.';

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
    if (!text || submitting) return;

    if (!navigator.onLine) {
      setSubmitError(offlineMessage);
      toast.error(offlineMessage);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const deletionResult = await deleteTrailingMessages({ id: message.id });

      if (!deletionResult.ok) {
        setSubmitError(deletionResult.message);
        return;
      }

      setMessages((msgs) => {
        const idx = msgs.findIndex((m) => m.id === message.id);
        if (idx === -1) return msgs;

        return [
          ...msgs.slice(0, idx),
          { ...message, parts: [{ type: 'text', text }] } as UI_MESSAGE,
        ];
      });

      setMode('view');
      await regenerate();
    } catch {
      setSubmitError('Не удалось обновить сообщение. Попробуйте снова.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex w-full flex-col items-end gap-1">
      <div className="min-w-0 w-full rounded-lg bg-secondary p-2 shadow-sm ring-1 ring-border/50">
        <Textarea
          ref={ref}
          value={draft}
          disabled={submitting}
          onChange={(e) => {
            setDraft(e.target.value);
            if (submitError) {
              setSubmitError(null);
            }
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
      {submitError ? (
        <p className="w-full text-xs text-destructive">{submitError}</p>
      ) : null}
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
