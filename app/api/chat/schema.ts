import { z } from 'zod';

const messagePartSchema = z
  .object({
    type: z.string(),
  })
  .loose();

const messageSchema = z.object({
  id: z.string().min(1).max(200),
  role: z.enum(['user', 'assistant']),
  parts: z.array(messagePartSchema),
});

export const postRequestBodySchema = z.object({
  id: z.uuid(),
  messages: z.array(messageSchema).min(1),
  selectedChatModel: z.string().min(1),
  trigger: z.enum(['submit-message', 'regenerate-message']),
  messageId: z.string().min(1).max(200).optional(),
});

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;
