import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_CHAT_REASONING_LEVEL,
  chatModelProviders,
  chatModels,
  chatReasoningLevels,
  getFallbackChatModelId,
  isChatModelId,
  isKnownChatReasoningLevelId,
  resolveChatModelId,
  resolveChatReasoningLevelId,
} from '@/lib/ai/models';

describe('chat model registry', () => {
  it('keeps Gemini 3.5 Flash as the default', () => {
    expect(DEFAULT_CHAT_MODEL).toBe('google/gemini-3.5-flash');
    expect(resolveChatModelId()).toBe(DEFAULT_CHAT_MODEL);
  });

  it('allows GPT-5.6 Luna and Terra but not arbitrary model IDs', () => {
    expect(isChatModelId('openai/gpt-5.6-luna')).toBe(true);
    expect(isChatModelId('openai/gpt-5.6-terra')).toBe(true);
    expect(isChatModelId('openai/gpt-5.6-sol')).toBe(false);
  });

  it('retires Gemini Flash-Lite to the default model', () => {
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
      ['google/gemini-3.5-flash', 'google/gemini-3.1-pro-preview'],
      ['openai/gpt-5.6-luna', 'openai/gpt-5.6-terra'],
    ]);
  });

  it('uses cross-provider fallbacks for everyday models', () => {
    expect(getFallbackChatModelId('google/gemini-3.5-flash')).toBe(
      'openai/gpt-5.6-luna',
    );
    expect(getFallbackChatModelId('openai/gpt-5.6-luna')).toBe(
      'google/gemini-3.5-flash',
    );
    expect(getFallbackChatModelId('openai/gpt-5.6-terra')).toBe(
      'google/gemini-3.5-flash',
    );
  });
});
