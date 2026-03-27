import {
  type User, type InsertUser, users,
  type LogSession, type InsertLogSession, logSessions,
  type LogEntry, type InsertLogEntry, logEntries,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, sql, desc } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

// Create tables if not exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS log_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    server_type TEXT NOT NULL,
    total_lines INTEGER NOT NULL DEFAULT 0,
    parsed_lines INTEGER NOT NULL DEFAULT 0,
    uploaded_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS log_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    ip TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    method TEXT NOT NULL,
    url TEXT NOT NULL,
    protocol TEXT,
    status_code INTEGER NOT NULL,
    body_bytes INTEGER NOT NULL DEFAULT 0,
    referer TEXT,
    user_agent TEXT NOT NULL,
    bot_name TEXT,
    is_bot INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_entries_session ON log_entries(session_id);
  CREATE INDEX IF NOT EXISTS idx_entries_bot ON log_entries(session_id, is_bot);
  CREATE INDEX IF NOT EXISTS idx_entries_status ON log_entries(session_id, status_code);
`);

export const db = drizzle(sqlite);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  createSession(session: InsertLogSession): Promise<LogSession>;
  getSession(id: number): Promise<LogSession | undefined>;
  getAllSessions(): Promise<LogSession[]>;
  deleteSession(id: number): Promise<void>;
  updateSessionCounts(id: number, totalLines: number, parsedLines: number): Promise<void>;

  insertLogEntries(entries: InsertLogEntry[]): Promise<void>;
  getEntriesBySession(sessionId: number): Promise<LogEntry[]>;

  getStatusCodeDistribution(sessionId: number): Promise<{ statusCode: number; count: number }[]>;
  getUserAgentStats(sessionId: number): Promise<{ userAgent: string; botName: string | null; isBot: number; count: number }[]>;
  getBotCrawlStats(sessionId: number): Promise<{ botName: string; count: number; urls: number; errors: number }[]>;
  getTopUrls(sessionId: number, limit: number): Promise<{ url: string; count: number; avgStatus: number }[]>;
  getHourlyDistribution(sessionId: number): Promise<{ hour: string; total: number; bots: number }[]>;
  getStatusCodeByBot(sessionId: number): Promise<{ botName: string; statusCode: number; count: number }[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.id, id)).get();
  }
  async getUserByUsername(username: string): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.username, username)).get();
  }
  async createUser(insertUser: InsertUser): Promise<User> {
    return db.insert(users).values(insertUser).returning().get();
  }

  async createSession(session: InsertLogSession): Promise<LogSession> {
    return db.insert(logSessions).values(session).returning().get();
  }

  async getSession(id: number): Promise<LogSession | undefined> {
    return db.select().from(logSessions).where(eq(logSessions.id, id)).get();
  }

  async getAllSessions(): Promise<LogSession[]> {
    return db.select().from(logSessions).orderBy(desc(logSessions.id)).all();
  }

  async deleteSession(id: number): Promise<void> {
    db.delete(logEntries).where(eq(logEntries.sessionId, id)).run();
    db.delete(logSessions).where(eq(logSessions.id, id)).run();
  }

  async updateSessionCounts(id: number, totalLines: number, parsedLines: number): Promise<void> {
    db.update(logSessions)
      .set({ totalLines, parsedLines })
      .where(eq(logSessions.id, id))
      .run();
  }

  async insertLogEntries(entries: InsertLogEntry[]): Promise<void> {
    if (entries.length === 0) return;
    // Batch insert in chunks of 500
    const chunkSize = 500;
    for (let i = 0; i < entries.length; i += chunkSize) {
      const chunk = entries.slice(i, i + chunkSize);
      db.insert(logEntries).values(chunk).run();
    }
  }

  async getEntriesBySession(sessionId: number): Promise<LogEntry[]> {
    return db.select().from(logEntries).where(eq(logEntries.sessionId, sessionId)).all();
  }

  async getStatusCodeDistribution(sessionId: number): Promise<{ statusCode: number; count: number }[]> {
    const rows = sqlite.prepare(`
      SELECT status_code as statusCode, COUNT(*) as count
      FROM log_entries WHERE session_id = ?
      GROUP BY status_code ORDER BY count DESC
    `).all(sessionId) as any[];
    return rows;
  }

  async getUserAgentStats(sessionId: number): Promise<{ userAgent: string; botName: string | null; isBot: number; count: number }[]> {
    const rows = sqlite.prepare(`
      SELECT
        CASE WHEN LENGTH(user_agent) > 100 THEN SUBSTR(user_agent, 1, 100) || '...' ELSE user_agent END as userAgent,
        bot_name as botName,
        is_bot as isBot,
        COUNT(*) as count
      FROM log_entries WHERE session_id = ?
      GROUP BY user_agent ORDER BY count DESC LIMIT 50
    `).all(sessionId) as any[];
    return rows;
  }

  async getBotCrawlStats(sessionId: number): Promise<{ botName: string; count: number; urls: number; errors: number }[]> {
    const rows = sqlite.prepare(`
      SELECT
        bot_name as botName,
        COUNT(*) as count,
        COUNT(DISTINCT url) as urls,
        SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as errors
      FROM log_entries
      WHERE session_id = ? AND is_bot = 1 AND bot_name IS NOT NULL
      GROUP BY bot_name ORDER BY count DESC
    `).all(sessionId) as any[];
    return rows;
  }

  async getTopUrls(sessionId: number, limit: number): Promise<{ url: string; count: number; avgStatus: number }[]> {
    const rows = sqlite.prepare(`
      SELECT url, COUNT(*) as count, ROUND(AVG(status_code)) as avgStatus
      FROM log_entries WHERE session_id = ?
      GROUP BY url ORDER BY count DESC LIMIT ?
    `).all(sessionId, limit) as any[];
    return rows;
  }

  async getHourlyDistribution(sessionId: number): Promise<{ hour: string; total: number; bots: number }[]> {
    const rows = sqlite.prepare(`
      SELECT
        SUBSTR(timestamp, 1, 13) as hour,
        COUNT(*) as total,
        SUM(CASE WHEN is_bot = 1 THEN 1 ELSE 0 END) as bots
      FROM log_entries WHERE session_id = ?
      GROUP BY hour ORDER BY hour
    `).all(sessionId) as any[];
    return rows;
  }

  async getStatusCodeByBot(sessionId: number): Promise<{ botName: string; statusCode: number; count: number }[]> {
    const rows = sqlite.prepare(`
      SELECT bot_name as botName, status_code as statusCode, COUNT(*) as count
      FROM log_entries
      WHERE session_id = ? AND is_bot = 1 AND bot_name IS NOT NULL
      GROUP BY bot_name, status_code ORDER BY bot_name, count DESC
    `).all(sessionId) as any[];
    return rows;
  }
}

export const storage = new DatabaseStorage();
