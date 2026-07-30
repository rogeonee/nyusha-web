import { google } from '@ai-sdk/google';
import { openai, type OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { gateway, streamText, type LanguageModel, type ToolSet } from 'ai';
import {
  getChatModelById,
  getChatReasoningLevelById,
  getThinkingConfigForModel,
  type ChatModel,
  type ChatReasoningLevelId,
} from '@/lib/ai/models';

type StreamTextProviderOptions = NonNullable<
  Parameters<typeof streamText>[0]['providerOptions']
>;

export function getLanguageModel(modelId?: string | null): LanguageModel {
  const chatModel = getChatModelById(modelId);

  if (chatModel.provider === 'google') {
    return google(chatModel.sdkModelId) as unknown as LanguageModel;
  }

  return gateway(chatModel.sdkModelId);
}

export function getProviderOptionsForModel({
  model,
  reasoningLevelId,
}: {
  model: ChatModel;
  reasoningLevelId: ChatReasoningLevelId;
}): StreamTextProviderOptions {
  if (model.provider === 'google') {
    const thinkingConfig = getThinkingConfigForModel({
      model,
      reasoningLevelId,
    });

    if (!thinkingConfig) {
      throw new Error(`Missing Google thinking config for ${model.id}`);
    }

    return {
      google: {
        thinkingConfig,
      },
    };
  }

  const reasoningLevel = getChatReasoningLevelById(reasoningLevelId);

  return {
    openai: {
      reasoningEffort: reasoningLevel.thinkingLevel,
      reasoningSummary: 'auto',
      store: false,
    } satisfies OpenAIResponsesProviderOptions,
    gateway: {
      only: ['openai'],
    },
  };
}

export function getWebSearchToolsForModel(model: ChatModel): ToolSet {
  if (model.provider === 'google') {
    return {
      google_search: google.tools.googleSearch({}),
    };
  }

  return {
    web_search: openai.tools.webSearch({}),
  };
}
