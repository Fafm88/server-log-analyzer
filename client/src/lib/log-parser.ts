// ========================
// Types
// ========================
export interface ParsedLogEntry {
  ip: string;
  timestamp: string;
  method: string;
  url: string;
  protocol: string | null;
  statusCode: number;
  bodyBytes: number;
  referer: string | null;
  userAgent: string;
  botName: string | null;
  isBot: boolean;
}

export interface LogSession {
  id: string;
  filename: string;
  serverType: string;
  totalLines: number;
  parsedLines: number;
  uploadedAt: string;
  entries: ParsedLogEntry[];
}

export interface AnalyticsData {
  session: LogSession;
  summary: {
    totalRequests: number;
    botRequests: number;
    errorRequests: number;
    uniqueUrls: number;
    statusGroups: Record<string, number>;
  };
  statusCodes: { statusCode: number; count: number }[];
  userAgents: { userAgent: string; botName: string | null; isBot: boolean; count: number }[];
  botCrawl: { botName: string; count: number; urls: number; errors: number }[];
  topUrls: { url: string; count: number; avgStatus: number }[];
  hourly: { hour: string; total: number; bots: number }[];
  statusByBot: { botName: string; statusCode: number; count: number }[];
}

// ========================
// Bot detection patterns
// ========================
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

// Nginx combined / Apache combined format
const COMBINED_REGEX = /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"(\S+)\s+(\S+)\s*(\S*)"\s+(\d{3})\s+(\d+|-)\s+"([^"]*)"\s+"([^"]*)"/;

function parseLogLine(line: string): ParsedLogEntry | null {
  const match = line.match(COMBINED_REGEX);
  if (!match) return null;

  const [, ip, rawTimestamp, method, url, protocol, statusStr, bytesStr, referer, userAgent] = match;
  const statusCode = parseInt(statusStr, 10);
  const bodyBytes = bytesStr === "-" ? 0 : parseInt(bytesStr, 10);

  let timestamp = rawTimestamp;
  try {
    const parts = rawTimestamp.match(/(\d{2})\/(\w{3})\/(\d{4}):(\d{2}:\d{2}:\d{2})\s+([+-]\d{4})/);
    if (parts) {
      const months: Record<string, string> = {
        Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
        Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
      };
      timestamp = `${parts[3]}-${months[parts[2]] || "01"}-${parts[1]}T${parts[4]}`;
    }
  } catch { /* keep raw */ }

  const bot = detectBot(userAgent);

  return {
    ip,
    timestamp,
    method: method || "GET",
    url: url || "/",
    protocol: protocol || null,
    statusCode,
    bodyBytes: isNaN(bodyBytes) ? 0 : bodyBytes,
    referer: referer === "-" ? null : referer,
    userAgent: userAgent || "",
    botName: bot.botName,
    isBot: bot.isBot,
  };
}

// ========================
// Parse entire file
// ========================
export function parseLogFile(
  content: string,
  filename: string,
  onProgress?: (parsed: number, total: number) => void,
): LogSession {
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const entries: ParsedLogEntry[] = [];
  let parsedCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const parsed = parseLogLine(lines[i]);
    if (parsed) {
      entries.push(parsed);
      parsedCount++;
    }
    if (onProgress && i % 5000 === 0) {
      onProgress(i, lines.length);
    }
  }

  const serverType = content.includes("nginx")
    ? "nginx"
    : content.includes("Apache") || content.includes("apache")
    ? "apache"
    : "nginx";

  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    filename,
    serverType,
    totalLines: lines.length,
    parsedLines: parsedCount,
    uploadedAt: new Date().toISOString(),
    entries,
  };
}

// ========================
// Compute analytics
// ========================
export function computeAnalytics(session: LogSession): AnalyticsData {
  const entries = session.entries;

  // Status code distribution
  const statusMap = new Map<number, number>();
  for (const e of entries) {
    statusMap.set(e.statusCode, (statusMap.get(e.statusCode) || 0) + 1);
  }
  const statusCodes = Array.from(statusMap.entries())
    .map(([statusCode, count]) => ({ statusCode, count }))
    .sort((a, b) => b.count - a.count);

  // Status groups
  const statusGroups: Record<string, number> = {};
  for (const { statusCode, count } of statusCodes) {
    const group = `${Math.floor(statusCode / 100)}xx`;
    statusGroups[group] = (statusGroups[group] || 0) + count;
  }

  // User-Agent stats
  const uaMap = new Map<string, { ua: string; botName: string | null; isBot: boolean; count: number }>();
  for (const e of entries) {
    const existing = uaMap.get(e.userAgent);
    if (existing) {
      existing.count++;
    } else {
      uaMap.set(e.userAgent, {
        ua: e.userAgent.length > 100 ? e.userAgent.slice(0, 100) + "..." : e.userAgent,
        botName: e.botName,
        isBot: e.isBot,
        count: 1,
      });
    }
  }
  const userAgents = Array.from(uaMap.values())
    .map((v) => ({ userAgent: v.ua, botName: v.botName, isBot: v.isBot, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);

  // Bot crawl stats
  const botMap = new Map<string, { count: number; urls: Set<string>; errors: number }>();
  for (const e of entries) {
    if (e.isBot && e.botName) {
      const existing = botMap.get(e.botName);
      if (existing) {
        existing.count++;
        existing.urls.add(e.url);
        if (e.statusCode >= 400) existing.errors++;
      } else {
        botMap.set(e.botName, {
          count: 1,
          urls: new Set([e.url]),
          errors: e.statusCode >= 400 ? 1 : 0,
        });
      }
    }
  }
  const botCrawl = Array.from(botMap.entries())
    .map(([botName, v]) => ({ botName, count: v.count, urls: v.urls.size, errors: v.errors }))
    .sort((a, b) => b.count - a.count);

  // Top URLs
  const urlMap = new Map<string, { count: number; statusSum: number }>();
  for (const e of entries) {
    const existing = urlMap.get(e.url);
    if (existing) {
      existing.count++;
      existing.statusSum += e.statusCode;
    } else {
      urlMap.set(e.url, { count: 1, statusSum: e.statusCode });
    }
  }
  const topUrls = Array.from(urlMap.entries())
    .map(([url, v]) => ({ url, count: v.count, avgStatus: Math.round(v.statusSum / v.count) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);

  // Hourly distribution
  const hourMap = new Map<string, { total: number; bots: number }>();
  for (const e of entries) {
    const hour = e.timestamp.slice(0, 13); // "YYYY-MM-DDTHH"
    const existing = hourMap.get(hour);
    if (existing) {
      existing.total++;
      if (e.isBot) existing.bots++;
    } else {
      hourMap.set(hour, { total: 1, bots: e.isBot ? 1 : 0 });
    }
  }
  const hourly = Array.from(hourMap.entries())
    .map(([hour, v]) => ({ hour, total: v.total, bots: v.bots }))
    .sort((a, b) => a.hour.localeCompare(b.hour));

  // Status by bot
  const statusByBotMap = new Map<string, Map<number, number>>();
  for (const e of entries) {
    if (e.isBot && e.botName) {
      if (!statusByBotMap.has(e.botName)) statusByBotMap.set(e.botName, new Map());
      const inner = statusByBotMap.get(e.botName)!;
      inner.set(e.statusCode, (inner.get(e.statusCode) || 0) + 1);
    }
  }
  const statusByBot: { botName: string; statusCode: number; count: number }[] = [];
  for (const [botName, inner] of statusByBotMap) {
    for (const [statusCode, count] of inner) {
      statusByBot.push({ botName, statusCode, count });
    }
  }
  statusByBot.sort((a, b) => a.botName.localeCompare(b.botName) || b.count - a.count);

  // Summary
  const totalRequests = entries.length;
  const botRequests = entries.filter((e) => e.isBot).length;
  const errorRequests = entries.filter((e) => e.statusCode >= 400).length;

  return {
    session,
    summary: {
      totalRequests,
      botRequests,
      errorRequests,
      uniqueUrls: urlMap.size,
      statusGroups,
    },
    statusCodes,
    userAgents,
    botCrawl,
    topUrls,
    hourly,
    statusByBot,
  };
}
