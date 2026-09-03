export const CHAT_MODEL_COOKIE_NAME = 'chat-model';
export const CHAT_REASONING_COOKIE_NAME = 'chat-reasoning-level';

export const chatModelProviders = [
  {
    id: 'google',
    name: 'Google',
  },
  {
    id: 'openai',
    name: 'OpenAI',
  },
] as const;

export type ChatModelProvider = (typeof chatModelProviders)[number];
export type ChatModelProviderId = ChatModelProvider['id'];

export const chatReasoningLevels = [
  {
    id: 'low',
    name: 'Low',
    shortName: 'Low',
    description: 'Lighter reasoning for faster, lower-cost responses',
    thinkingLevel: 'low',
  },
  {
    id: 'medium',
    name: 'Medium',
    shortName: 'Medium',
    description: 'Balanced reasoning for most everyday prompts',
    thinkingLevel: 'medium',
  },
  {
    id: 'high',
    name: 'High',
    shortName: 'High',
    description: 'Deeper reasoning with more latency and cost',
    thinkingLevel: 'high',
  },
] as const;

export type ChatReasoningLevel = (typeof chatReasoningLevels)[number];
export type ChatReasoningLevelId = ChatReasoningLevel['id'];

export const chatModels = [
  {
    id: 'google/gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    shortName: '3.8 Flash',
    provider: 'google',
    description: 'Default frontier Flash model for everyday coding and tasks',
    sdkModelId: 'gemini-3.8-flash',
    thinkingConfig: { thinkingLevel: 'medium', includeThoughts: true },
  },
  {
    id: 'google/gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    shortName: '3.1 Pro',
    provider: 'google',
    description: 'Heavy hitter for the strongest Gemini reasoning quality',
    sdkModelId: 'gemini-3.1-pro-preview',
    thinkingConfig: { thinkingLevel: 'high', includeThoughts: true },
  },
  {
    id: 'openai/gpt-5.6-luna',
    name: 'GPT-5.6 Luna',
    shortName: '5.6 Luna',
    provider: 'openai',
    description: 'Fast, affordable GPT-5.6 model for everyday work',
    sdkModelId: 'openai/gpt-5.6-luna',
  },
  {
    id: 'openai/gpt-5.6-terra',
    name: 'GPT-5.6 Terra',
    shortName: '5.6 Terra',
    provider: 'openai',
    description: 'Balanced GPT-5.6 model for more demanding tasks',
    sdkModelId: 'openai/gpt-5.6-terra',
  },
] as const;

export type ChatModel = (typeof chatModels)[number];
export type ChatModelId = ChatModel['id'];

export const DEFAULT_CHAT_MODEL: ChatModelId = 'google/gemini-3.8-flash';
export const DEFAULT_CHAT_REASONING_LEVEL: ChatReasoningLevelId = 'medium';
const MODEL_FALLBACKS: Partial<Record<ChatModelId, ChatModelId>> = {
  'google/gemini-3.1-pro-preview': 'google/gemini-3.8-flash',
  'google/gemini-3.8-flash': 'openai/gpt-5.6-luna',
  'openai/gpt-5.6-luna': 'google/gemini-3.8-flash',
  'openai/gpt-5.6-terra': 'google/gemini-3.8-flash',
};

const LEGACY_MODEL_ALIASES: Partial<Record<string, ChatModelId>> = {
  'google/gemini-3-pro-preview': 'google/gemini-3.1-pro-preview',
  'google/gemini-3-flash-preview': DEFAULT_CHAT_MODEL,
  'google/gemini-3.5-flash': DEFAULT_CHAT_MODEL,
  'google/gemini-2.5-flash': DEFAULT_CHAT_MODEL,
  'google/gemini-3.1-flash-lite': DEFAULT_CHAT_MODEL,
};

const LEGACY_REASONING_LEVEL_ALIASES: Partial<
  Record<string, ChatReasoningLevelId>
> = {
  standard: 'medium',
  extended: 'high',
};

const chatModelById = new Map<ChatModelId, ChatModel>(
  chatModels.map((model) => [model.id, model]),
);
const chatReasoningLevelById = new Map<
  ChatReasoningLevelId,
  ChatReasoningLevel
>(chatReasoningLevels.map((level) => [level.id, level]));

export function isChatModelId(value: string): value is ChatModelId {
  return chatModelById.has(value as ChatModelId);
}

export function isChatReasoningLevelId(
  value: string,
): value is ChatReasoningLevelId {
  return chatReasoningLevelById.has(value as ChatReasoningLevelId);
}

export function isKnownChatReasoningLevelId(value: string): boolean {
  return (
    isChatReasoningLevelId(value) ||
    LEGACY_REASONING_LEVEL_ALIASES[value] !== undefined
  );
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

  if (value && LEGACY_REASONING_LEVEL_ALIASES[value]) {
    return LEGACY_REASONING_LEVEL_ALIASES[value];
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
  if (model.provider !== 'google') {
    return null;
  }

  const reasoningLevel = getChatReasoningLevelById(reasoningLevelId);

  return {
    ...model.thinkingConfig,
    thinkingLevel: reasoningLevel.thinkingLevel,
  };
}
