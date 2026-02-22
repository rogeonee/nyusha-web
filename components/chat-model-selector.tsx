'use client';

import { Check, ChevronDown } from 'lucide-react';
import {
  CHAT_MODEL_COOKIE_NAME,
  chatModels,
  getChatModelById,
  type ChatModel,
  type ChatModelId,
} from '@/lib/ai/models';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const CHAT_MODEL_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function setChatModelCookie(modelId: ChatModelId) {
  document.cookie = `${CHAT_MODEL_COOKIE_NAME}=${encodeURIComponent(
    modelId,
  )}; path=/; max-age=${CHAT_MODEL_COOKIE_MAX_AGE}`;
}

export function ChatModelSelector({
  selectedModelId,
  onModelChange,
}: {
  selectedModelId: ChatModelId;
  onModelChange: (modelId: ChatModelId) => void;
}) {
  const selectedModel = getChatModelById(selectedModelId);
  const compareByVersion = (a: ChatModel, b: ChatModel) =>
    Number.parseFloat(a.shortName) - Number.parseFloat(b.shortName);
  const proModels = [...chatModels]
    .filter((model) => model.family === 'pro')
    .sort(compareByVersion);
  const flashModels = [...chatModels]
    .filter((model) => model.family === 'flash')
    .sort(compareByVersion);

  const renderModelItems = (models: readonly ChatModel[]) =>
    models.map((model) => (
      <DropdownMenuItem
        key={model.id}
        onSelect={() => {
          onModelChange(model.id);
          setChatModelCookie(model.id);
        }}
        className="items-start gap-2"
      >
        <div className="min-w-0">
          <div className="truncate">{model.name}</div>
          <div className="text-xs text-muted-foreground">
            {model.description}
          </div>
        </div>
        {model.id === selectedModel.id ? (
          <Check className="ml-auto mt-0.5 size-4 shrink-0" />
        ) : null}
      </DropdownMenuItem>
    ));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 max-w-[230px] justify-between px-2 text-xs sm:text-sm"
        >
          <span className="truncate">{selectedModel.shortName}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
          Pro
        </DropdownMenuLabel>
        {renderModelItems(proModels)}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
          Flash
        </DropdownMenuLabel>
        {renderModelItems(flashModels)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
