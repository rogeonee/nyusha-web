export const CHAT_MODEL_COOKIE_NAME = 'chat-model';

export const chatModels = [
  {
    id: 'google/gemini-3-pro-preview',
    name: 'Gemini 3.0 Pro',
    shortName: '3.0 Pro',
    provider: 'google',
    description: 'Most capable for complex questions and planning',
    sdkModelId: 'gemini-3-pro-preview',
    thinkingConfig: { thinkingLevel: 'high', includeThoughts: true },
  },
  {
    id: 'google/gemini-3-flash-preview',
    name: 'Gemini 3.0 Flash',
    shortName: '3.0 Flash',
    provider: 'google',
    description: 'Latest Flash — fast, smart, and cost-effective',
    sdkModelId: 'gemini-3-flash-preview',
    thinkingConfig: { thinkingLevel: 'high', includeThoughts: true },
  },
  {
    id: 'google/gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    shortName: '2.5 Flash',
    provider: 'google',
    description: 'Proven and efficient for everyday chats',
    sdkModelId: 'gemini-2.5-flash',
    thinkingConfig: { thinkingBudget: 0, includeThoughts: false },
  },
] as const;

export type ChatModel = (typeof chatModels)[number];
export type ChatModelId = ChatModel['id'];

export const DEFAULT_CHAT_MODEL: ChatModelId = 'google/gemini-2.5-flash';

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

  return DEFAULT_CHAT_MODEL;
}

export function getChatModelById(value?: string | null): ChatModel {
  return chatModelById.get(resolveChatModelId(value)) ?? chatModels[0];
}
