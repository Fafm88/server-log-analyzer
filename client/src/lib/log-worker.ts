// =============================================
// Web Worker for streaming log file parsing
// Aggregates analytics on-the-fly — no entry storage
// Supports multi-file sessions: postMessage runs one pass per file,
// worker itself stateless; UI merges results.
// =============================================

// --- Types ---

export interface UserAgentRow {
  userAgent: string;
  botName: string | null;
  isBot: boolean;
  count: number;
  statusCounts: Record<string, number>; // "2xx" | "3xx" | "4xx" | "5xx"
  topUrl: string; // most requested URL by this UA
  topUrlCount: number;
}

export interface DetailRow {
  userAgent: string; // truncated
  botName: string | null;
  isBot: boolean;
  url: string;
  statusCode: number;
  count: number;
}

export interface BotErrorRow {
  botName: string;
  url: string;
  statusCode: number;
  count: number;
}

export interface WorkerAnalytics {
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
  userAgents: UserAgentRow[]; // ALL (not top-50) — sorted by count desc
  botCrawl: { botName: string; count: number; urls: number; errors: number }[];
  topUrls: { url: string; count: number; avgStatus: number }[];
  hourly: { hour: string; total: number; bots: number }[];
  statusByBot: { botName: string; statusCode: number; count: number }[];
  dailyBots: { date: string; counts: Record<string, number>; total: number }[];
  trackedBotsPresent: string[];
  // NEW — detail + bot errors
  details: DetailRow[]; // UA × URL × statusCode (capped)
  botErrors: BotErrorRow[]; // errors (>=400) only, all bots
  detailsTruncated: boolean; // true if detail cap was hit
}

// =============================================
// Bot detection
// =============================================
const BOT_PATTERNS: [RegExp, string][] = [
  [/OAI-SearchBot/i, "OAI-SearchBot"],
  [/ChatGPT-User/i, "ChatGPT-User"],
  [/GPTBot/i, "GPTBot"],
  [/Claude-SearchBot/i, "Claude-SearchBot"],
  [/Claude-User/i, "Claude-User"],
  [/ClaudeBot/i, "ClaudeBot"],
  [/anthropic-ai/i, "Anthropic-AI"],
  [/Perplexity-User/i, "Perplexity-User"],
  [/PerplexityBot/i, "PerplexityBot"],
  [/Google-Extended/i, "Google-Extended"],
  [/Googlebot-Image/i, "Googlebot-Image"],
  [/Googlebot-Video/i, "Googlebot-Video"],
  [/Googlebot-News/i, "Googlebot-News"],
  [/Google-InspectionTool/i, "Google-InspectionTool"],
  [/Storebot-Google/i, "Storebot-Google"],
  [/AdsBot-Google/i, "AdsBot-Google"],
  [/Mediapartners-Google/i, "Mediapartners-Google"],
  [/APIs-Google/i, "APIs-Google"],
  [/GoogleOther/i, "GoogleOther"],
  [/Googlebot/i, "Googlebot"],
  [/YandexAdditional/i, "YandexAdditionalBot"],
  [/YandexImages/i, "YandexImages"],
  [/YandexMedia/i, "YandexMedia"],
  [/YandexMetrika/i, "YandexMetrika"],
  [/YandexDirect/i, "YandexDirect"],
  [/YandexAccessibilityBot/i, "YandexAccessibilityBot"],
  [/YandexMobileBot/i, "YandexMobileBot"],
  [/YandexPagechecker/i, "YandexPagechecker"],
  [/YandexWebmaster/i, "YandexWebmaster"],
  [/YandexBot/i, "YandexBot"],
  [/bingbot/i, "bingbot"],
  [/msnbot/i, "MSNBot"],
  [/BingPreview/i, "BingPreview"],
  [/DeepSeek/i, "DeepSeekBot"],
  [/Bytespider/i, "Bytespider"],
  [/CCBot/i, "CCBot"],
  [/Meta-ExternalAgent/i, "Meta-ExternalAgent"],
  [/facebot|facebookexternalhit/i, "Facebook"],
  [/Baiduspider/i, "Baiduspider"],
  [/DuckDuckBot/i, "DuckDuckBot"],
  [/DuckAssistBot/i, "DuckAssistBot"],
  [/Applebot/i, "Applebot"],
  [/Sogou/i, "Sogou"],
  [/Twitterbot/i, "Twitterbot"],
  [/LinkedInBot/i, "LinkedInBot"],
  [/SemrushBot/i, "SemrushBot"],
  [/AhrefsBot/i, "AhrefsBot"],
  [/MJ12bot/i, "MJ12bot"],
  [/DotBot/i, "DotBot"],
  [/PetalBot/i, "PetalBot"],
  [/bot|crawler|spider|scraper/i, "Other Bot"],
];

const TRACKED_BOTS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User",
  "Googlebot", "Google-Extended",
  "bingbot",
  "ClaudeBot", "Claude-User", "Claude-SearchBot",
  "PerplexityBot", "Perplexity-User",
  "DeepSeekBot", "Bytespider",
  "YandexAdditionalBot", "YandexBot",
  "CCBot",
];
const TRACKED_SET = new Set(TRACKED_BOTS);

function detectBot(ua: string): { isBot: boolean; botName: string | null } {
  for (const [pattern, name] of BOT_PATTERNS) {
    if (pattern.test(ua)) return { isBot: true, botName: name };
  }
  return { isBot: false, botName: null };
}

// =============================================
// Line parser
// =============================================
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

function truncateUA(ua: string): string {
  return ua.length > 200 ? ua.slice(0, 200) + "…" : ua;
}

function truncateUrl(url: string): string {
  return url.length > 300 ? url.slice(0, 300) + "…" : url;
}

// =============================================
// Streaming aggregator
// =============================================
class StreamingAggregator {
  totalLines = 0;
  parsedLines = 0;
  totalRequests = 0;
  botRequests = 0;
  errorRequests = 0;

  statusMap = new Map<number, number>();
  // userAgent -> row with status breakdown and top URL tracking
  uaMap = new Map<string, {
    userAgent: string; botName: string | null; isBot: boolean;
    count: number;
    statusCounts: Record<string, number>;
    urlCounts: Map<string, number>; // capped per-UA to save memory
  }>();
  botMap = new Map<string, { count: number; urls: Set<string>; errors: number }>();
  urlMap = new Map<string, { count: number; statusSum: number }>();
  hourMap = new Map<string, { total: number; bots: number }>();
  statusByBotMap = new Map<string, Map<number, number>>();

  dailyBotMap = new Map<string, Map<string, number>>();
  trackedPresent = new Set<string>();

  // UA × URL × statusCode for the detail view.
  // Composite key: `${uaIdx}|${urlIdx}|${status}` via index maps to save memory.
  detailMap = new Map<string, number>();
  uaIdx = new Map<string, number>();
  urlIdxMap = new Map<string, number>();
  detailsTruncated = false;

  // Bot errors: `${botName}|${url}|${status}` -> count
  botErrorMap = new Map<string, number>();

  // Caps to protect against OOM on pathological 1 GB inputs
  private readonly MAX_UA = 50000;
  private readonly MAX_URLS = 200000;
  private readonly MAX_BOT_URLS = 10000;
  private readonly MAX_URLS_PER_UA = 200;
  private readonly MAX_DETAIL_ROWS = 300000;
  private readonly MAX_BOT_ERRORS = 50000;

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
    const statusGroup = `${Math.floor(statusCode / 100)}xx`;

    if (bot.isBot) this.botRequests++;
    if (statusCode >= 400) this.errorRequests++;

    this.statusMap.set(statusCode, (this.statusMap.get(statusCode) || 0) + 1);

    // ---- User-Agent aggregation ----
    if (this.uaMap.size < this.MAX_UA || this.uaMap.has(userAgent)) {
      const existing = this.uaMap.get(userAgent);
      if (existing) {
        existing.count++;
        existing.statusCounts[statusGroup] = (existing.statusCounts[statusGroup] || 0) + 1;
        if (existing.urlCounts.size < this.MAX_URLS_PER_UA || existing.urlCounts.has(url)) {
          existing.urlCounts.set(url, (existing.urlCounts.get(url) || 0) + 1);
        }
      } else {
        const urlCounts = new Map<string, number>();
        urlCounts.set(url, 1);
        this.uaMap.set(userAgent, {
          userAgent: truncateUA(userAgent),
          botName: bot.botName,
          isBot: bot.isBot,
          count: 1,
          statusCounts: { [statusGroup]: 1 },
          urlCounts,
        });
      }
    }

    // ---- Bot crawl ----
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

      if (!this.statusByBotMap.has(bot.botName)) this.statusByBotMap.set(bot.botName, new Map());
      const inner = this.statusByBotMap.get(bot.botName)!;
      inner.set(statusCode, (inner.get(statusCode) || 0) + 1);

      if (TRACKED_SET.has(bot.botName)) {
        this.trackedPresent.add(bot.botName);
        const date = timestamp.slice(0, 10);
        let byBot = this.dailyBotMap.get(date);
        if (!byBot) {
          byBot = new Map();
          this.dailyBotMap.set(date, byBot);
        }
        byBot.set(bot.botName, (byBot.get(bot.botName) || 0) + 1);
      }

      // Bot errors
      if (statusCode >= 400) {
        if (this.botErrorMap.size < this.MAX_BOT_ERRORS) {
          const key = `${bot.botName}\x01${url}\x01${statusCode}`;
          this.botErrorMap.set(key, (this.botErrorMap.get(key) || 0) + 1);
        }
      }
    }

    // ---- URLs (global) ----
    if (this.urlMap.size < this.MAX_URLS || this.urlMap.has(url)) {
      const existing = this.urlMap.get(url);
      if (existing) {
        existing.count++;
        existing.statusSum += statusCode;
      } else {
        this.urlMap.set(url, { count: 1, statusSum: statusCode });
      }
    }

    // ---- Detail (UA × URL × status) via composite integer keys ----
    if (!this.detailsTruncated) {
      let uaI = this.uaIdx.get(userAgent);
      if (uaI === undefined) {
        uaI = this.uaIdx.size;
        this.uaIdx.set(userAgent, uaI);
      }
      let urlI = this.urlIdxMap.get(url);
      if (urlI === undefined) {
        urlI = this.urlIdxMap.size;
        this.urlIdxMap.set(url, urlI);
      }
      const key = `${uaI}|${urlI}|${statusCode}`;
      if (this.detailMap.has(key)) {
        this.detailMap.set(key, this.detailMap.get(key)! + 1);
      } else if (this.detailMap.size < this.MAX_DETAIL_ROWS) {
        this.detailMap.set(key, 1);
      } else {
        this.detailsTruncated = true;
      }
    }

    // ---- Hourly ----
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
    const statusCodes = Array.from(this.statusMap.entries())
      .map(([statusCode, count]) => ({ statusCode, count }))
      .sort((a, b) => b.count - a.count);

    const statusGroups: Record<string, number> = {};
    for (const { statusCode, count } of statusCodes) {
      const group = `${Math.floor(statusCode / 100)}xx`;
      statusGroups[group] = (statusGroups[group] || 0) + count;
    }

    // User-Agents: build rows with top-URL per UA, return ALL, sorted desc
    const userAgents: UserAgentRow[] = [];
    for (const v of this.uaMap.values()) {
      let topUrl = "";
      let topUrlCount = 0;
      for (const [u, c] of v.urlCounts) {
        if (c > topUrlCount) {
          topUrlCount = c;
          topUrl = u;
        }
      }
      userAgents.push({
        userAgent: v.userAgent,
        botName: v.botName,
        isBot: v.isBot,
        count: v.count,
        statusCounts: v.statusCounts,
        topUrl: truncateUrl(topUrl),
        topUrlCount,
      });
    }
    userAgents.sort((a, b) => b.count - a.count);

    const botCrawl = Array.from(this.botMap.entries())
      .map(([botName, v]) => ({ botName, count: v.count, urls: v.urls.size, errors: v.errors }))
      .sort((a, b) => b.count - a.count);

    const topUrls = Array.from(this.urlMap.entries())
      .map(([url, v]) => ({ url, count: v.count, avgStatus: Math.round(v.statusSum / v.count) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);

    const hourly = Array.from(this.hourMap.entries())
      .map(([hour, v]) => ({ hour, total: v.total, bots: v.bots }))
      .sort((a, b) => a.hour.localeCompare(b.hour));

    const statusByBot: { botName: string; statusCode: number; count: number }[] = [];
    for (const [botName, inner] of this.statusByBotMap) {
      for (const [statusCode, count] of inner) {
        statusByBot.push({ botName, statusCode, count });
      }
    }
    statusByBot.sort((a, b) => a.botName.localeCompare(b.botName) || b.count - a.count);

    const dailyDates = Array.from(this.dailyBotMap.keys()).sort();
    const dailyBots = dailyDates.map((date) => {
      const inner = this.dailyBotMap.get(date)!;
      const counts: Record<string, number> = {};
      let total = 0;
      for (const [bot, c] of inner) {
        counts[bot] = c;
        total += c;
      }
      return { date, counts, total };
    });
    const trackedBotsPresent = TRACKED_BOTS.filter((b) => this.trackedPresent.has(b));

    // Details: reverse index maps back to strings
    const uaRev = new Array<string>(this.uaIdx.size);
    for (const [k, v] of this.uaIdx) uaRev[v] = k;
    const urlRev = new Array<string>(this.urlIdxMap.size);
    for (const [k, v] of this.urlIdxMap) urlRev[v] = k;

    const details: DetailRow[] = [];
    for (const [key, count] of this.detailMap) {
      const [ui, urli, sc] = key.split("|");
      const ua = uaRev[parseInt(ui, 10)];
      const bot = detectBot(ua);
      details.push({
        userAgent: truncateUA(ua),
        botName: bot.botName,
        isBot: bot.isBot,
        url: truncateUrl(urlRev[parseInt(urli, 10)]),
        statusCode: parseInt(sc, 10),
        count,
      });
    }
    details.sort((a, b) => b.count - a.count);

    // Bot errors
    const botErrors: BotErrorRow[] = [];
    for (const [key, count] of this.botErrorMap) {
      const [botName, url, sc] = key.split("\x01");
      botErrors.push({
        botName,
        url: truncateUrl(url),
        statusCode: parseInt(sc, 10),
        count,
      });
    }
    botErrors.sort((a, b) => b.count - a.count);

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
      dailyBots,
      trackedBotsPresent,
      details,
      botErrors,
      detailsTruncated: this.detailsTruncated,
    };
  }
}

// =============================================
// Message handler — supports multi-file in one session
// Input: { files: File[], sessionName: string }
// =============================================
self.onmessage = async (e: MessageEvent) => {
  const { files, sessionName } = e.data as { files: File[]; sessionName: string };
  const agg = new StreamingAggregator();

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  let bytesReadGlobal = 0;
  let lastProgressAt = 0;

  try {
    for (let fi = 0; fi < files.length; fi++) {
      const file = files[fi];
      let remainder = "";
      const reader = file.stream().getReader();
      const decoder = new TextDecoder("utf-8");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        bytesReadGlobal += value.byteLength;
        const text = remainder + decoder.decode(value, { stream: true });
        const lines = text.split("\n");
        remainder = lines.pop() || "";

        for (const line of lines) {
          if (line.length > 0) agg.addLine(line);
        }

        const now = Date.now();
        if (now - lastProgressAt > 100) {
          lastProgressAt = now;
          self.postMessage({
            type: "progress",
            bytesRead: bytesReadGlobal,
            totalBytes,
            linesProcessed: agg.totalLines,
            linesParsed: agg.parsedLines,
            currentFile: file.name,
            filesProcessed: fi,
            totalFiles: files.length,
          });
        }
      }

      if (remainder.trim().length > 0) {
        agg.addLine(remainder);
      }
    }

    const analytics = agg.finalize(sessionName);
    self.postMessage({ type: "done", analytics });
  } catch (err: any) {
    self.postMessage({ type: "error", message: err?.message || "Ошибка при парсинге" });
  }
};
