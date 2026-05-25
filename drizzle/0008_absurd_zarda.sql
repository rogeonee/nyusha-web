ALTER TABLE "chats" ALTER COLUMN "model_id" SET DEFAULT 'google/gemini-3.5-flash';
UPDATE "chats"
SET "model_id" = 'google/gemini-3.5-flash'
WHERE "model_id" = 'google/gemini-3-flash-preview';
