'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface ReasoningChunk {
  title: string;
  body: string;
}

export function parseReasoningChunks(text: string): ReasoningChunk[] {
  const chunks: ReasoningChunk[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  const titles: { title: string; index: number; length: number }[] = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    titles.push({
      title: match[1],
      index: match.index,
      length: match[0].length,
    });
  }

  for (let i = 0; i < titles.length; i++) {
    const start = titles[i].index + titles[i].length;
    const end = i + 1 < titles.length ? titles[i + 1].index : text.length;
    chunks.push({
      title: titles[i].title,
      body: text.slice(start, end).trim(),
    });
  }

  return chunks;
}

export function ReasoningBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const normalizedText = text.trim();
  const chunks = parseReasoningChunks(normalizedText);
  const hasStructuredChunks = chunks.length > 0;

  if (!normalizedText) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-3">
      <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ChevronRight
          className={`size-3 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        Мысли модели
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1.5 space-y-2 text-sm leading-relaxed text-muted-foreground">
        {hasStructuredChunks ? (
          chunks.map((chunk, i) => (
            <div key={i}>
              <div className="font-medium">{chunk.title}</div>
              {chunk.body ? <div className="mt-0.5">{chunk.body}</div> : null}
            </div>
          ))
        ) : (
          <div className="whitespace-pre-wrap">{normalizedText}</div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
