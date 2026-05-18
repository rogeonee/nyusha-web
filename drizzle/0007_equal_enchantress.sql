ALTER TABLE "chats" ALTER COLUMN "model_id" SET DEFAULT 'google/gemini-3-flash-preview';
UPDATE "chats"
SET "model_id" = 'google/gemini-3.1-pro-preview'
WHERE "model_id" = 'google/gemini-3-pro-preview';
UPDATE "chats"
SET "model_id" = 'google/gemini-3-flash-preview'
WHERE "model_id" = 'google/gemini-2.5-flash';
