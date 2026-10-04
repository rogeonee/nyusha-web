import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_CHAT_REASONING_LEVEL,
  chatModelProviders,
  chatModels,
  chatReasoningLevels,
  getChatModelById,
  getFallbackChatModelId,
  isChatModelId,
  isKnownChatReasoningLevelId,
  resolveChatModelId,
  resolveChatReasoningLevelId,
} from '@/lib/ai/models';

describe('chat model registry', () => {
  it('keeps Gemini 3.8 Flash as the default', () => {
    expect(DEFAULT_CHAT_MODEL).toBe('google/gemini-3.8-flash');
    expect(resolveChatModelId()).toBe(DEFAULT_CHAT_MODEL);
  });

  it('allows GPT-6 Luna and GPT-6.1 Sol but not retired or arbitrary model IDs', () => {
    expect(isChatModelId('openai/gpt-6-luna')).toBe(true);
    expect(isChatModelId('openai/gpt-6.1-sol')).toBe(true);
    expect(isChatModelId('openai/gpt-5.6-terra')).toBe(false);
    expect(isChatModelId('openai/gpt-6.1-sol-fast')).toBe(false);
    expect(isChatModelId('openai/gpt-5.6-luna')).toBe(false);
    expect(isChatModelId('openai/gpt-5.6-sol')).toBe(false);
  });

  it('resolves saved GPT-5.6 Luna selections to GPT-6 Luna', () => {
    expect(resolveChatModelId('openai/gpt-5.6-luna')).toBe('openai/gpt-6-luna');
    expect(getChatModelById('openai/gpt-5.6-luna').sdkModelId).toBe(
      'openai/gpt-6-luna',
    );
  });

  it('resolves saved Terra chats and cookies to standard GPT-6.1 Sol', () => {
    expect(resolveChatModelId('openai/gpt-5.6-terra')).toBe('openai/gpt-6.1-sol');
    expect(getChatModelById('openai/gpt-5.6-terra').sdkModelId).toBe(
      'openai/gpt-6.1-sol',
    );
  });

  it('resolves retired Gemini models to the default model', () => {
    expect(isChatModelId('google/gemini-3.5-flash')).toBe(false);
    expect(resolveChatModelId('google/gemini-3.5-flash')).toBe(
      DEFAULT_CHAT_MODEL,
    );
    expect(isChatModelId('google/gemini-3.1-flash-lite')).toBe(false);
    expect(resolveChatModelId('google/gemini-3.1-flash-lite')).toBe(
      DEFAULT_CHAT_MODEL,
    );
  });

  it('offers low, medium, and high reasoning with medium as the default', () => {
    expect(chatReasoningLevels.map((level) => level.id)).toEqual([
      'low',
      'medium',
      'high',
    ]);
    expect(DEFAULT_CHAT_REASONING_LEVEL).toBe('medium');
  });

  it('preserves legacy reasoning preferences without accepting arbitrary IDs', () => {
    expect(isKnownChatReasoningLevelId('standard')).toBe(true);
    expect(isKnownChatReasoningLevelId('extended')).toBe(true);
    expect(isKnownChatReasoningLevelId('xhigh')).toBe(false);
    expect(resolveChatReasoningLevelId('standard')).toBe('medium');
    expect(resolveChatReasoningLevelId('extended')).toBe('high');
  });

  it('groups models in Google then OpenAI order', () => {
    expect(chatModelProviders.map((provider) => provider.id)).toEqual([
      'google',
      'openai',
    ]);
    expect(
      chatModelProviders.map((provider) =>
        chatModels
          .filter((model) => model.provider === provider.id)
          .map((model) => model.id),
      ),
    ).toEqual([
      ['google/gemini-3.8-flash', 'google/gemini-3.1-pro-preview'],
      ['openai/gpt-6-luna', 'openai/gpt-6.1-sol'],
    ]);
  });

  it('uses cross-provider fallbacks for everyday models', () => {
    expect(getFallbackChatModelId('google/gemini-3.8-flash')).toBe(
      'openai/gpt-6-luna',
    );
    expect(getFallbackChatModelId('openai/gpt-6-luna')).toBe(
      'google/gemini-3.8-flash',
    );
    expect(getFallbackChatModelId('openai/gpt-6.1-sol')).toBe(
      'google/gemini-3.8-flash',
    );
  });
});
