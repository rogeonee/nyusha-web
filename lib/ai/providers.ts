import { google } from '@ai-sdk/google';
import { type LanguageModel } from 'ai';
import { getChatModelById } from '@/lib/ai/models';

export function getLanguageModel(modelId?: string | null): LanguageModel {
  const chatModel = getChatModelById(modelId);

  return google(chatModel.sdkModelId) as unknown as LanguageModel;
}
