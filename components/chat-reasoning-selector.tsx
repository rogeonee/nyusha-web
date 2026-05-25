'use client';

import { useEffect, useState } from 'react';
import { Brain, Check, ChevronDown } from 'lucide-react';
import {
  CHAT_REASONING_COOKIE_NAME,
  chatReasoningLevels,
  getChatReasoningLevelById,
  type ChatReasoningLevelId,
} from '@/lib/ai/models';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const CHAT_REASONING_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function setChatReasoningCookie(reasoningLevelId: ChatReasoningLevelId) {
  document.cookie = `${CHAT_REASONING_COOKIE_NAME}=${encodeURIComponent(
    reasoningLevelId,
  )}; path=/; max-age=${CHAT_REASONING_COOKIE_MAX_AGE}`;
}

export function ChatReasoningSelector({
  selectedReasoningLevelId,
  onReasoningLevelChange,
}: {
  selectedReasoningLevelId: ChatReasoningLevelId;
  onReasoningLevelChange: (reasoningLevelId: ChatReasoningLevelId) => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const selectedReasoningLevel = getChatReasoningLevelById(
    selectedReasoningLevelId,
  );

  if (!mounted) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 max-w-[230px] justify-between gap-1.5 px-2 text-xs sm:text-sm"
        disabled
      >
        <Brain className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{selectedReasoningLevel.shortName}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 max-w-[230px] justify-between gap-1.5 px-2 text-xs sm:text-sm"
        >
          <Brain className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{selectedReasoningLevel.shortName}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {chatReasoningLevels.map((reasoningLevel) => (
          <DropdownMenuItem
            key={reasoningLevel.id}
            onSelect={() => {
              onReasoningLevelChange(reasoningLevel.id);
              setChatReasoningCookie(reasoningLevel.id);
            }}
            className="items-start gap-2"
          >
            <div className="min-w-0">
              <div className="truncate">{reasoningLevel.name}</div>
              <div className="text-xs text-muted-foreground">
                {reasoningLevel.description}
              </div>
            </div>
            {reasoningLevel.id === selectedReasoningLevel.id ? (
              <Check className="ml-auto mt-0.5 size-4 shrink-0" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
