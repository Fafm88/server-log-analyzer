// =============================================
// Web Worker for streaming log file parsing
// Aggregates analytics on-the-fly — no entry storage
// =============================================

// --- Types (duplicated here because workers are isolated) ---

interface WorkerAnalytics {
  sessionMeta: {
    id: string;
    filename: string;
    serverType: string;
    totalLines: number;
    parsedLines: number;
    uploadedAt: string;
  };
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

// --- Bot detection ---
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
    if (pattern.test(ua)) return { isBot: true, botName: name };
  }
  return { isBot: false, botName: null };
}

// --- Line parser ---
const COMBINED_REGEX = /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"(\S+)\s+(\S+)\s*(\S*)"\s+(\d{3})\s+(\d+|-)\s+"([^"]*)"\s+"([^"]*)"/;

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

function parseTimestamp(raw: string): string {
  const p = raw.match(/(\d{2})\/(\w{3})\/(\d{4}):(\d{2}:\d{2}:\d{2})\s+([+-]\d{4})/);
  if (p) return `${p[3]}-${MONTHS[p[2]] || "01"}-${p[1]}T${p[4]}`;
  return raw;
}

// --- Streaming aggregator ---
class StreamingAggregator {
  totalLines = 0;
  parsedLines = 0;
  totalRequests = 0;
  botRequests = 0;
  errorRequests = 0;

  // Status codes
  statusMap = new Map<number, number>();
  // User-Agent stats (keyed by truncated UA to limit memory)
  uaMap = new Map<string, { ua: string; botName: string | null; isBot: boolean; count: number }>();
  // Bot crawl: botName -> { count, urls (Set capped), errors }
  botMap = new Map<string, { count: number; urls: Set<string>; errors: number }>();
  // Top URLs (approximate — keep top N using a count map)
  urlMap = new Map<string, { count: number; statusSum: number }>();
  // Hourly
  hourMap = new Map<string, { total: number; bots: number }>();
  // Status by bot
  statusByBotMap = new Map<string, Map<number, number>>();

  // Limit maps to avoid OOM on pathological inputs
  private readonly MAX_UA = 10000;
  private readonly MAX_URLS = 50000;
  private readonly MAX_BOT_URLS = 5000;

  addLine(line: string): void {
    this.totalLines++;
    const m = line.match(COMBINED_REGEX);
    if (!m) return;

    this.parsedLines++;
    this.totalRequests++;

    const statusCode = parseInt(m[6], 10);
    const userAgent = m[9] || "";
    const url = m[4] || "/";
    const timestamp = parseTimestamp(m[2]);
    const bot = detectBot(userAgent);

    if (bot.isBot) this.botRequests++;
    if (statusCode >= 400) this.errorRequests++;

    // Status codes
    this.statusMap.set(statusCode, (this.statusMap.get(statusCode) || 0) + 1);

    // User-Agent
    if (this.uaMap.size < this.MAX_UA || this.uaMap.has(userAgent)) {
      const existing = this.uaMap.get(userAgent);
      if (existing) {
        existing.count++;
      } else {
        this.uaMap.set(userAgent, {
          ua: userAgent.length > 120 ? userAgent.slice(0, 120) + "..." : userAgent,
          botName: bot.botName,
          isBot: bot.isBot,
          count: 1,
        });
      }
    }

    // Bot crawl
    if (bot.isBot && bot.botName) {
      const existing = this.botMap.get(bot.botName);
      if (existing) {
        existing.count++;
        if (existing.urls.size < this.MAX_BOT_URLS) existing.urls.add(url);
        if (statusCode >= 400) existing.errors++;
      } else {
        this.botMap.set(bot.botName, {
          count: 1,
          urls: new Set([url]),
          errors: statusCode >= 400 ? 1 : 0,
        });
      }

      // Status by bot
      if (!this.statusByBotMap.has(bot.botName)) this.statusByBotMap.set(bot.botName, new Map());
      const inner = this.statusByBotMap.get(bot.botName)!;
      inner.set(statusCode, (inner.get(statusCode) || 0) + 1);
    }

    // URLs
    if (this.urlMap.size < this.MAX_URLS || this.urlMap.has(url)) {
      const existing = this.urlMap.get(url);
      if (existing) {
        existing.count++;
        existing.statusSum += statusCode;
      } else {
        this.urlMap.set(url, { count: 1, statusSum: statusCode });
      }
    }

    // Hourly
    const hour = timestamp.slice(0, 13);
    const hourExisting = this.hourMap.get(hour);
    if (hourExisting) {
      hourExisting.total++;
      if (bot.isBot) hourExisting.bots++;
    } else {
      this.hourMap.set(hour, { total: 1, bots: bot.isBot ? 1 : 0 });
    }
  }

  finalize(filename: string): WorkerAnalytics {
    // Status codes sorted
    const statusCodes = Array.from(this.statusMap.entries())
      .map(([statusCode, count]) => ({ statusCode, count }))
      .sort((a, b) => b.count - a.count);

    // Status groups
    const statusGroups: Record<string, number> = {};
    for (const { statusCode, count } of statusCodes) {
      const group = `${Math.floor(statusCode / 100)}xx`;
      statusGroups[group] = (statusGroups[group] || 0) + count;
    }

    // User agents — top 50
    const userAgents = Array.from(this.uaMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);

    // Bot crawl
    const botCrawl = Array.from(this.botMap.entries())
      .map(([botName, v]) => ({ botName, count: v.count, urls: v.urls.size, errors: v.errors }))
      .sort((a, b) => b.count - a.count);

    // Top URLs
    const topUrls = Array.from(this.urlMap.entries())
      .map(([url, v]) => ({ url, count: v.count, avgStatus: Math.round(v.statusSum / v.count) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);

    // Hourly
    const hourly = Array.from(this.hourMap.entries())
      .map(([hour, v]) => ({ hour, total: v.total, bots: v.bots }))
      .sort((a, b) => a.hour.localeCompare(b.hour));

    // Status by bot
    const statusByBot: { botName: string; statusCode: number; count: number }[] = [];
    for (const [botName, inner] of this.statusByBotMap) {
      for (const [statusCode, count] of inner) {
        statusByBot.push({ botName, statusCode, count });
      }
    }
    statusByBot.sort((a, b) => a.botName.localeCompare(b.botName) || b.count - a.count);

    const id = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return {
      sessionMeta: {
        id,
        filename,
        serverType: "nginx",
        totalLines: this.totalLines,
        parsedLines: this.parsedLines,
        uploadedAt: new Date().toISOString(),
      },
      summary: {
        totalRequests: this.totalRequests,
        botRequests: this.botRequests,
        errorRequests: this.errorRequests,
        uniqueUrls: this.urlMap.size,
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
}

// --- Message handler ---
self.onmessage = async (e: MessageEvent) => {
  const { file, filename } = e.data as { file: File; filename: string };
  const agg = new StreamingAggregator();

  const fileSize = file.size;
  const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB chunks
  let bytesRead = 0;
  let remainder = "";

  // Use streaming reader for memory efficiency
  const reader = file.stream().getReader();
  const decoder = new TextDecoder("utf-8");
  let lastProgressAt = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      bytesRead += value.byteLength;
      const text = remainder + decoder.decode(value, { stream: true });
      const lines = text.split("\n");

      // Last element is partial — save for next chunk
      remainder = lines.pop() || "";

      for (const line of lines) {
        if (line.length > 0) agg.addLine(line);
      }

      // Throttled progress reporting — at most every 100ms
      const now = Date.now();
      if (now - lastProgressAt > 100) {
        lastProgressAt = now;
        self.postMessage({
          type: "progress",
          bytesRead,
          totalBytes: fileSize,
          linesProcessed: agg.totalLines,
          linesParsed: agg.parsedLines,
        });
      }
    }

    // Process remainder
    if (remainder.trim().length > 0) {
      agg.addLine(remainder);
    }

    // Final result
    const analytics = agg.finalize(filename);
    self.postMessage({ type: "done", analytics });
  } catch (err: any) {
    self.postMessage({ type: "error", message: err?.message || "Ошибка при парсинге" });
  }
};
