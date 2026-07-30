import { describe, expect, it } from 'vitest';
import { getChatModelById, type ChatReasoningLevelId } from '@/lib/ai/models';
import {
  getProviderOptionsForModel,
  getWebSearchToolsForModel,
} from '@/lib/ai/providers';

function getOptions(modelId: string, reasoningLevelId: ChatReasoningLevelId) {
  return getProviderOptionsForModel({
    model: getChatModelById(modelId),
    reasoningLevelId,
  });
}

describe('chat model provider configuration', () => {
  it('keeps Gemini reasoning and search on the direct Google provider', () => {
    expect(getOptions('google/gemini-3.5-flash', 'high')).toEqual({
      google: {
        thinkingConfig: {
          thinkingLevel: 'high',
          includeThoughts: true,
        },
      },
    });
    expect(
      Object.keys(
        getWebSearchToolsForModel(getChatModelById('google/gemini-3.5-flash')),
      ),
    ).toEqual(['google_search']);
  });

  it('pins Luna to OpenAI with private, summarized reasoning', () => {
    expect(getOptions('openai/gpt-5.6-luna', 'medium')).toEqual({
      openai: {
        reasoningEffort: 'medium',
        reasoningSummary: 'auto',
        store: false,
      },
      gateway: {
        only: ['openai'],
      },
    });
    expect(
      Object.keys(
        getWebSearchToolsForModel(getChatModelById('openai/gpt-5.6-luna')),
      ),
    ).toEqual(['web_search']);
  });

  it('maps the full exposed reasoning scale for GPT-5.6', () => {
    expect(getOptions('openai/gpt-5.6-luna', 'low')).toMatchObject({
      openai: {
        reasoningEffort: 'low',
      },
    });
    expect(getOptions('openai/gpt-5.6-terra', 'high')).toMatchObject({
      openai: {
        reasoningEffort: 'high',
      },
    });
  });
});
