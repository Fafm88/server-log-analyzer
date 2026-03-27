import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const logSessions = sqliteTable("log_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filename: text("filename").notNull(),
  serverType: text("server_type").notNull(), // 'nginx' | 'apache'
  totalLines: integer("total_lines").notNull().default(0),
  parsedLines: integer("parsed_lines").notNull().default(0),
  uploadedAt: text("uploaded_at").notNull(),
});

export const logEntries = sqliteTable("log_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id").notNull(),
  ip: text("ip").notNull(),
  timestamp: text("timestamp").notNull(),
  method: text("method").notNull(),
  url: text("url").notNull(),
  protocol: text("protocol"),
  statusCode: integer("status_code").notNull(),
  bodyBytes: integer("body_bytes").notNull().default(0),
  referer: text("referer"),
  userAgent: text("user_agent").notNull(),
  botName: text("bot_name"),       // 'Googlebot', 'YandexBot', etc. or null
  isBot: integer("is_bot").notNull().default(0), // 0 or 1
});

export const insertLogSessionSchema = createInsertSchema(logSessions).omit({ id: true });
export const insertLogEntrySchema = createInsertSchema(logEntries).omit({ id: true });

export type InsertLogSession = z.infer<typeof insertLogSessionSchema>;
export type LogSession = typeof logSessions.$inferSelect;
export type InsertLogEntry = z.infer<typeof insertLogEntrySchema>;
export type LogEntry = typeof logEntries.$inferSelect;

// keep user table for template compatibility
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});
export const insertUserSchema = createInsertSchema(users).pick({ username: true, password: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
