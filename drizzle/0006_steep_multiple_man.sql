CREATE TABLE "chat_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"media_type" varchar(120) NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_provider" varchar(40) NOT NULL,
	"storage_key" text NOT NULL,
	"storage_url" text NOT NULL,
	"status" varchar(30) DEFAULT 'uploaded' NOT NULL,
	"gemini_file_uri" text,
	"gemini_file_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_file_attachments" (
	"message_id" text NOT NULL,
	"file_id" uuid NOT NULL,
	"chat_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_file_attachments_message_file_unique" UNIQUE("message_id","file_id")
);
--> statement-breakpoint
ALTER TABLE "chat_files" ADD CONSTRAINT "chat_files_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_files" ADD CONSTRAINT "chat_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_file_attachments" ADD CONSTRAINT "message_file_attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_file_attachments" ADD CONSTRAINT "message_file_attachments_file_id_chat_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."chat_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_file_attachments" ADD CONSTRAINT "message_file_attachments_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_files_chat_created_idx" ON "chat_files" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_files_user_created_idx" ON "chat_files" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_files_storage_key_unique_idx" ON "chat_files" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "message_file_attachments_chat_idx" ON "message_file_attachments" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "message_file_attachments_file_idx" ON "message_file_attachments" USING btree ("file_id");