export const CHAT_MODEL_COOKIE_NAME = 'chat-model';
export const CHAT_REASONING_COOKIE_NAME = 'chat-reasoning-level';

export const chatReasoningLevels = [
  {
    id: 'standard',
    name: 'Standard',
    shortName: 'Standard',
    description: 'Balanced reasoning for most everyday prompts',
    thinkingLevel: 'medium',
  },
  {
    id: 'extended',
    name: 'Extended',
    shortName: 'Extended',
    description: 'Deeper reasoning with more latency and cost',
    thinkingLevel: 'high',
  },
] as const;

export type ChatReasoningLevel = (typeof chatReasoningLevels)[number];
export type ChatReasoningLevelId = ChatReasoningLevel['id'];

export const chatModels = [
  {
    id: 'google/gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    shortName: '3.1 Pro',
    provider: 'google',
    family: 'pro',
    description: 'Heavy hitter for the strongest reasoning quality',
    sdkModelId: 'gemini-3.1-pro-preview',
    thinkingConfig: { thinkingLevel: 'high', includeThoughts: true },
  },
  {
    id: 'google/gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    shortName: '3.5 Flash',
    provider: 'google',
    family: 'flash',
    description: 'Default frontier Flash model for everyday coding and tasks',
    sdkModelId: 'gemini-3.5-flash',
    thinkingConfig: { thinkingLevel: 'medium', includeThoughts: true },
  },
  {
    id: 'google/gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash-Lite',
    shortName: '3.1 Lite',
    provider: 'google',
    family: 'flash',
    description: 'Faster and cheaper for simpler everyday chats',
    sdkModelId: 'gemini-3.1-flash-lite',
    thinkingConfig: { thinkingLevel: 'low', includeThoughts: false },
  },
] as const;

export type ChatModel = (typeof chatModels)[number];
export type ChatModelId = ChatModel['id'];

export const DEFAULT_CHAT_MODEL: ChatModelId = 'google/gemini-3.5-flash';
export const DEFAULT_CHAT_REASONING_LEVEL: ChatReasoningLevelId = 'standard';
const MODEL_FALLBACKS: Partial<Record<ChatModelId, ChatModelId>> = {
  'google/gemini-3.1-pro-preview': 'google/gemini-3.1-flash-lite',
  'google/gemini-3.5-flash': 'google/gemini-3.1-flash-lite',
};

const LEGACY_MODEL_ALIASES: Partial<Record<string, ChatModelId>> = {
  'google/gemini-3-pro-preview': 'google/gemini-3.1-pro-preview',
  'google/gemini-3-flash-preview': DEFAULT_CHAT_MODEL,
  'google/gemini-2.5-flash': DEFAULT_CHAT_MODEL,
};

const chatModelById = new Map<ChatModelId, ChatModel>(
  chatModels.map((model) => [model.id, model]),
);
const chatReasoningLevelById = new Map<
  ChatReasoningLevelId,
  ChatReasoningLevel
>(chatReasoningLevels.map((level) => [level.id, level]));

export const modelsByProvider = chatModels.reduce(
  (acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }

    acc[model.provider].push(model);
    return acc;
  },
  {} as Record<ChatModel['provider'], ChatModel[]>,
);

export function isChatModelId(value: string): value is ChatModelId {
  return chatModelById.has(value as ChatModelId);
}

export function isChatReasoningLevelId(
  value: string,
): value is ChatReasoningLevelId {
  return chatReasoningLevelById.has(value as ChatReasoningLevelId);
}

export function resolveChatModelId(value?: string | null): ChatModelId {
  if (value && isChatModelId(value)) {
    return value;
  }

  if (value && LEGACY_MODEL_ALIASES[value]) {
    return LEGACY_MODEL_ALIASES[value];
  }

  return DEFAULT_CHAT_MODEL;
}

export function resolveChatReasoningLevelId(
  value?: string | null,
): ChatReasoningLevelId {
  if (value && isChatReasoningLevelId(value)) {
    return value;
  }

  return DEFAULT_CHAT_REASONING_LEVEL;
}

export function getChatModelById(value?: string | null): ChatModel {
  return chatModelById.get(resolveChatModelId(value)) ?? chatModels[0];
}

export function getChatReasoningLevelById(
  value?: string | null,
): ChatReasoningLevel {
  return (
    chatReasoningLevelById.get(resolveChatReasoningLevelId(value)) ??
    chatReasoningLevels[0]
  );
}

export function getFallbackChatModelId(
  modelId: ChatModelId,
): ChatModelId | null {
  return MODEL_FALLBACKS[modelId] ?? null;
}

export function getThinkingConfigForModel({
  model,
  reasoningLevelId,
}: {
  model: ChatModel;
  reasoningLevelId: ChatReasoningLevelId;
}) {
  const reasoningLevel = getChatReasoningLevelById(reasoningLevelId);

  return {
    ...model.thinkingConfig,
    thinkingLevel: reasoningLevel.thinkingLevel,
  };
}
