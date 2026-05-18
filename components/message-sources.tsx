'use client';

import type { SourceDocumentUIPart, SourceUrlUIPart, UIMessage } from 'ai';
import { ChevronRight, ExternalLinkIcon, FileTextIcon } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

type MessageSource = SourceUrlUIPart | SourceDocumentUIPart;

function getSources(parts: UIMessage['parts']): MessageSource[] {
  return parts.filter(
    (part): part is MessageSource =>
      part.type === 'source-url' || part.type === 'source-document',
  );
}

function getSourceUrlLabel(source: SourceUrlUIPart) {
  if (source.title?.trim()) {
    return source.title;
  }

  try {
    return new URL(source.url).hostname;
  } catch {
    return source.url;
  }
}

export function MessageSources({ parts }: { parts: UIMessage['parts'] }) {
  const sources = getSources(parts);

  if (sources.length === 0) {
    return null;
  }

  return (
    <Collapsible className="mt-3">
      <CollapsibleTrigger className="group flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ChevronRight className="size-3 transition-transform group-data-[state=open]:rotate-90" />
        Источники · {sources.length}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-1.5">
        {sources.map((source, index) =>
          source.type === 'source-url' ? (
            <a
              key={`${source.sourceId}-${index}`}
              href={source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="flex w-fit max-w-full items-center gap-1.5 text-sm text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
            >
              <ExternalLinkIcon className="size-3 shrink-0" />
              <span className="truncate">{getSourceUrlLabel(source)}</span>
            </a>
          ) : (
            <div
              key={`${source.sourceId}-${index}`}
              className="flex max-w-full items-center gap-1.5 text-sm text-muted-foreground"
            >
              <FileTextIcon className="size-3 shrink-0" />
              <span className="truncate">
                {source.title || source.filename || 'Документ'}
              </span>
            </div>
          ),
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
