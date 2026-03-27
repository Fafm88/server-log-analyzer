import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import type { InsertLogEntry } from "@shared/schema";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 * 1024 } }); // 1GB

// Bot detection patterns
const BOT_PATTERNS: [RegExp, string][] = [
  [/Googlebot-Image/i, "Googlebot-Image"],
  [/Googlebot-Video/i, "Googlebot-Video"],
  [/Googlebot-News/i, "Googlebot-News"],
  [/Googlebot/i, "Googlebot"],
  [/Google-InspectionTool/i, "Google-InspectionTool"],
  [/Storebot-Google/i, "Storebot-Google"],
  [/AdsBot-Google/i, "AdsBot-Google"],
  [/Mediapartners-Google/i, "Mediapartners-Google"],
  [/APIs-Google/i, "APIs-Google"],
  [/GoogleOther/i, "GoogleOther"],
  [/YandexBot/i, "YandexBot"],
  [/YandexImages/i, "YandexImages"],
  [/YandexMedia/i, "YandexMedia"],
  [/YandexMetrika/i, "YandexMetrika"],
  [/YandexDirect/i, "YandexDirect"],
  [/YandexAccessibilityBot/i, "YandexAccessibilityBot"],
  [/YandexMobileBot/i, "YandexMobileBot"],
  [/YandexPagechecker/i, "YandexPagechecker"],
  [/YandexWebmaster/i, "YandexWebmaster"],
  [/bingbot/i, "Bingbot"],
  [/msnbot/i, "MSNBot"],
  [/BingPreview/i, "BingPreview"],
  [/Baiduspider/i, "Baiduspider"],
  [/DuckDuckBot/i, "DuckDuckBot"],
  [/Applebot/i, "Applebot"],
  [/Sogou/i, "Sogou"],
  [/facebot|facebookexternalhit/i, "Facebook"],
  [/Twitterbot/i, "Twitterbot"],
  [/LinkedInBot/i, "LinkedInBot"],
  [/SemrushBot/i, "SemrushBot"],
  [/AhrefsBot/i, "AhrefsBot"],
  [/MJ12bot/i, "MJ12bot"],
  [/DotBot/i, "DotBot"],
  [/PetalBot/i, "PetalBot"],
  [/Bytespider/i, "Bytespider"],
  [/GPTBot/i, "GPTBot"],
  [/ClaudeBot/i, "ClaudeBot"],
  [/CCBot/i, "CCBot"],
  [/ChatGPT-User/i, "ChatGPT-User"],
  [/PerplexityBot/i, "PerplexityBot"],
  [/bot|crawler|spider|scraper/i, "Other Bot"],
];

function detectBot(ua: string): { isBot: boolean; botName: string | null } {
  for (const [pattern, name] of BOT_PATTERNS) {
    if (pattern.test(ua)) {
      return { isBot: true, botName: name };
    }
  }
  return { isBot: false, botName: null };
}

// Nginx combined / Apache combined format:
// 1.2.3.4 - - [27/Mar/2026:10:15:30 +0300] "GET /path HTTP/1.1" 200 1234 "http://referer" "User-Agent"
const COMBINED_REGEX = /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"(\S+)\s+(\S+)\s*(\S*)"\s+(\d{3})\s+(\d+|-)\s+"([^"]*)"\s+"([^"]*)"/;

function parseLogLine(line: string): Omit<InsertLogEntry, 'sessionId'> | null {
  const match = line.match(COMBINED_REGEX);
  if (!match) return null;

  const [, ip, rawTimestamp, method, url, protocol, statusStr, bytesStr, referer, userAgent] = match;
  const statusCode = parseInt(statusStr, 10);
  const bodyBytes = bytesStr === '-' ? 0 : parseInt(bytesStr, 10);

  // Parse timestamp: 27/Mar/2026:10:15:30 +0300
  let timestamp = rawTimestamp;
  try {
    const parts = rawTimestamp.match(/(\d{2})\/(\w{3})\/(\d{4}):(\d{2}:\d{2}:\d{2})\s+([+-]\d{4})/);
    if (parts) {
      const months: Record<string, string> = {
        Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
        Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
      };
      timestamp = `${parts[3]}-${months[parts[2]] || '01'}-${parts[1]}T${parts[4]}`;
    }
  } catch { /* keep raw */ }

  const bot = detectBot(userAgent);

  return {
    ip,
    timestamp,
    method: method || 'GET',
    url: url || '/',
    protocol: protocol || null,
    statusCode,
    bodyBytes: isNaN(bodyBytes) ? 0 : bodyBytes,
    referer: referer === '-' ? null : referer,
    userAgent: userAgent || '',
    botName: bot.botName,
    isBot: bot.isBot ? 1 : 0,
  };
}

function detectServerType(content: string): 'nginx' | 'apache' {
  // Both use the same combined format. Try to detect by common patterns
  if (content.includes('nginx')) return 'nginx';
  if (content.includes('Apache') || content.includes('apache')) return 'apache';
  return 'nginx'; // default
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Upload and parse log file
  app.post("/api/upload", upload.single("logfile"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Файл не загружен" });
      }

      const content = req.file.buffer.toString("utf-8");
      const lines = content.split("\n").filter(l => l.trim().length > 0);
      const serverType = detectServerType(content);

      const session = await storage.createSession({
        filename: req.file.originalname || "unknown.log",
        serverType,
        totalLines: lines.length,
        parsedLines: 0,
        uploadedAt: new Date().toISOString(),
      });

      const entries: InsertLogEntry[] = [];
      let parsedCount = 0;

      for (const line of lines) {
        const parsed = parseLogLine(line);
        if (parsed) {
          entries.push({ ...parsed, sessionId: session.id });
          parsedCount++;
        }
      }

      await storage.insertLogEntries(entries);
      await storage.updateSessionCounts(session.id, lines.length, parsedCount);

      res.json({
        sessionId: session.id,
        filename: session.filename,
        serverType,
        totalLines: lines.length,
        parsedLines: parsedCount,
      });
    } catch (err: any) {
      console.error("Upload error:", err);
      res.status(500).json({ error: err.message || "Ошибка при обработке файла" });
    }
  });

  // Get all sessions
  app.get("/api/sessions", async (_req, res) => {
    const sessions = await storage.getAllSessions();
    res.json(sessions);
  });

  // Delete session
  app.delete("/api/sessions/:id", async (req, res) => {
    await storage.deleteSession(parseInt(req.params.id, 10));
    res.json({ ok: true });
  });

  // Get session analytics
  app.get("/api/sessions/:id/analytics", async (req, res) => {
    const sessionId = parseInt(req.params.id, 10);
    const session = await storage.getSession(sessionId);
    if (!session) return res.status(404).json({ error: "Сессия не найдена" });

    const [statusCodes, userAgents, botCrawl, topUrls, hourly, statusByBot] = await Promise.all([
      storage.getStatusCodeDistribution(sessionId),
      storage.getUserAgentStats(sessionId),
      storage.getBotCrawlStats(sessionId),
      storage.getTopUrls(sessionId, 30),
      storage.getHourlyDistribution(sessionId),
      storage.getStatusCodeByBot(sessionId),
    ]);

    // Compute summary KPIs
    const totalRequests = statusCodes.reduce((s, r) => s + r.count, 0);
    const botRequests = botCrawl.reduce((s, r) => s + r.count, 0);
    const errorRequests = statusCodes.filter(r => r.statusCode >= 400).reduce((s, r) => s + r.count, 0);
    const uniqueUrls = topUrls.length; // approximate from top 30

    // Status code groups
    const statusGroups: Record<string, number> = {};
    for (const r of statusCodes) {
      const group = `${Math.floor(r.statusCode / 100)}xx`;
      statusGroups[group] = (statusGroups[group] || 0) + r.count;
    }

    res.json({
      session,
      summary: {
        totalRequests,
        botRequests,
        errorRequests,
        uniqueUrls,
        statusGroups,
      },
      statusCodes,
      userAgents,
      botCrawl,
      topUrls,
      hourly,
      statusByBot,
    });
  });

  return httpServer;
}
