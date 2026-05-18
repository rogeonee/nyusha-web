export const CHAT_MODEL_COOKIE_NAME = 'chat-model';

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
    id: 'google/gemini-3-flash-preview',
    name: 'Gemini 3.0 Flash',
    shortName: '3.0 Flash',
    provider: 'google',
    family: 'flash',
    description: 'Default balance of speed, quality, and cost',
    sdkModelId: 'gemini-3-flash-preview',
    thinkingConfig: { thinkingLevel: 'low', includeThoughts: true },
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

export const DEFAULT_CHAT_MODEL: ChatModelId = 'google/gemini-3-flash-preview';
const PREVIEW_MODEL_FALLBACKS: Partial<Record<ChatModelId, ChatModelId>> = {
  'google/gemini-3.1-pro-preview': 'google/gemini-3.1-flash-lite',
  'google/gemini-3-flash-preview': 'google/gemini-3.1-flash-lite',
};

const LEGACY_MODEL_ALIASES: Partial<Record<string, ChatModelId>> = {
  'google/gemini-3-pro-preview': 'google/gemini-3.1-pro-preview',
  'google/gemini-2.5-flash': DEFAULT_CHAT_MODEL,
};

const chatModelById = new Map<ChatModelId, ChatModel>(
  chatModels.map((model) => [model.id, model]),
);

export const modelsByProvider = chatModels.reduce((acc, model) => {
  if (!acc[model.provider]) {
    acc[model.provider] = [];
  }

  acc[model.provider].push(model);
  return acc;
}, {} as Record<ChatModel['provider'], ChatModel[]>);

export function isChatModelId(value: string): value is ChatModelId {
  return chatModelById.has(value as ChatModelId);
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

export function getChatModelById(value?: string | null): ChatModel {
  return chatModelById.get(resolveChatModelId(value)) ?? chatModels[0];
}

export function getFallbackChatModelId(
  modelId: ChatModelId,
): ChatModelId | null {
  return PREVIEW_MODEL_FALLBACKS[modelId] ?? null;
}
