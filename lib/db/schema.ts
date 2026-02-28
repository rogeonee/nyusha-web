import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  json,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom().notNull(),
    email: varchar('email', { length: 320 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastFailedLoginAt: timestamp('last_failed_login_at', {
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex('users_email_unique_idx').on(table.email)],
);

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom().notNull(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const assistantGenerationReservations = pgTable(
  'assistant_generation_reservations',
  {
    id: uuid('id').primaryKey().defaultRandom().notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('assistant_generation_reservations_user_expires_idx').on(
      table.userId,
      table.expiresAt,
    ),
  ],
);

export const chats = pgTable('chats', {
  id: uuid('id').primaryKey().notNull(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  modelId: varchar('model_id', { length: 100 })
    .notNull()
    .default('google/gemini-2.5-flash'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const messages = pgTable('messages', {
  id: text('id').primaryKey().notNull(),
  chatId: uuid('chat_id')
    .notNull()
    .references(() => chats.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull(),
  parts: json('parts').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const chatFiles = pgTable(
  'chat_files',
  {
    id: uuid('id').primaryKey().defaultRandom().notNull(),
    chatId: uuid('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    mediaType: varchar('media_type', { length: 120 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    storageProvider: varchar('storage_provider', { length: 40 }).notNull(),
    storageKey: text('storage_key').notNull(),
    storageUrl: text('storage_url').notNull(),
    status: varchar('status', { length: 30 }).notNull().default('uploaded'),
    geminiFileUri: text('gemini_file_uri'),
    geminiFileExpiresAt: timestamp('gemini_file_expires_at', {
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('chat_files_chat_created_idx').on(table.chatId, table.createdAt),
    index('chat_files_user_created_idx').on(table.userId, table.createdAt),
    uniqueIndex('chat_files_storage_key_unique_idx').on(table.storageKey),
  ],
);

export const messageFileAttachments = pgTable(
  'message_file_attachments',
  {
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => chatFiles.id, { onDelete: 'cascade' }),
    chatId: uuid('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('message_file_attachments_message_file_unique').on(
      table.messageId,
      table.fileId,
    ),
    index('message_file_attachments_chat_idx').on(table.chatId),
    index('message_file_attachments_file_idx').on(table.fileId),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  assistantGenerationReservations: many(assistantGenerationReservations),
  chats: many(chats),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const chatsRelations = relations(chats, ({ one, many }) => ({
  user: one(users, {
    fields: [chats.userId],
    references: [users.id],
  }),
  messages: many(messages),
  files: many(chatFiles),
  messageFileAttachments: many(messageFileAttachments),
}));

export const assistantGenerationReservationsRelations = relations(
  assistantGenerationReservations,
  ({ one }) => ({
    user: one(users, {
      fields: [assistantGenerationReservations.userId],
      references: [users.id],
    }),
  }),
);

export const messagesRelations = relations(messages, ({ one, many }) => ({
  chat: one(chats, {
    fields: [messages.chatId],
    references: [chats.id],
  }),
  attachments: many(messageFileAttachments),
}));

export const chatFilesRelations = relations(chatFiles, ({ one, many }) => ({
  chat: one(chats, {
    fields: [chatFiles.chatId],
    references: [chats.id],
  }),
  user: one(users, {
    fields: [chatFiles.userId],
    references: [users.id],
  }),
  attachments: many(messageFileAttachments),
}));

export const messageFileAttachmentsRelations = relations(
  messageFileAttachments,
  ({ one }) => ({
    message: one(messages, {
      fields: [messageFileAttachments.messageId],
      references: [messages.id],
    }),
    file: one(chatFiles, {
      fields: [messageFileAttachments.fileId],
      references: [chatFiles.id],
    }),
    chat: one(chats, {
      fields: [messageFileAttachments.chatId],
      references: [chats.id],
    }),
  }),
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Chat = typeof chats.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type ChatFile = typeof chatFiles.$inferSelect;
export type MessageFileAttachment = typeof messageFileAttachments.$inferSelect;
