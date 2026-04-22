// =============================================
// Bot verification via DNS-over-HTTPS (DoH)
// Implements the reverse+forward DNS check recommended by
// Google and Yandex for confirming bot authenticity.
// =============================================

// Google: verified reverse DNS must end in one of these
const GOOGLE_SUFFIXES = [".googlebot.com", ".google.com", ".googleusercontent.com"];
// Yandex: verified reverse DNS must end in one of these
const YANDEX_SUFFIXES = [".yandex.ru", ".yandex.net", ".yandex.com"];

// Bots whose authenticity we can check via reverse DNS.
// Duplicated from log-worker.ts so the main thread can import without pulling in worker code.
export const VERIFIABLE_BOTS = new Set([
  "Googlebot", "Googlebot-Image", "Googlebot-Video", "Googlebot-News",
  "Google-Extended", "AdsBot-Google", "Mediapartners-Google",
  "APIs-Google", "GoogleOther", "Storebot-Google", "Google-InspectionTool",
  "YandexBot", "YandexAdditionalBot", "YandexImages", "YandexMedia",
  "YandexMetrika", "YandexDirect", "YandexMobileBot",
  "YandexWebmaster", "YandexPagechecker", "YandexAccessibilityBot",
]);

// DoH endpoint — Cloudflare's JSON API supports CORS.
// Docs: https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/
const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";

// We limit parallelism so we don't trip Cloudflare's rate-limiting.
const CONCURRENCY = 8;

// In-memory cache keyed by IP (one verification result per IP per session).
const cache = new Map<string, IpVerification>();

export type VerificationStatus =
  | "verified"     // reverse+forward DNS chain confirms the bot
  | "fake"         // chain mismatches or unrelated hostname
  | "unverifiable" // DoH returned no answer (NXDOMAIN, timeout, etc.)
  | "error";       // network error

export interface IpVerification {
  ip: string;
  status: VerificationStatus;
  ptr: string | null;         // reverse DNS result
  chainOk: boolean;           // forward DNS mapped back to the same IP
  matchedFamily: "google" | "yandex" | null;
  reason?: string;            // short human-readable description
}

export interface BotVerificationResult {
  botName: string;
  expectedFamily: "google" | "yandex";
  ipsChecked: number;
  ipsTotal: number;     // some may be skipped if > MAX
  verified: number;
  fake: number;
  unverifiable: number;
  errors: number;
  // Per-IP details (capped to keep UI responsive)
  details: IpVerification[];
}

// ---------------------------------------------
// Helpers
// ---------------------------------------------

function expectedFamily(botName: string): "google" | "yandex" {
  return botName.startsWith("Yandex") ? "yandex" : "google";
}

// Build reverse-DNS name for an IPv4 address: 1.2.3.4 -> 4.3.2.1.in-addr.arpa
function reverseV4(ip: string): string | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || parseInt(p, 10) > 255) return null;
  }
  return `${parts[3]}.${parts[2]}.${parts[1]}.${parts[0]}.in-addr.arpa`;
}

// Build reverse-DNS name for IPv6 (expand + nibble-reverse + ip6.arpa).
// Accepts shortened ("::") IPv6 addresses.
function reverseV6(ip: string): string | null {
  if (!ip.includes(":")) return null;
  // Expand ::
  let expanded: string[];
  if (ip.includes("::")) {
    const [head, tail] = ip.split("::");
    const headParts = head ? head.split(":") : [];
    const tailParts = tail ? tail.split(":") : [];
    const missing = 8 - headParts.length - tailParts.length;
    if (missing < 0) return null;
    expanded = [...headParts, ...Array(missing).fill("0"), ...tailParts];
  } else {
    expanded = ip.split(":");
    if (expanded.length !== 8) return null;
  }
  // Left-pad each group to 4 hex chars
  const full = expanded.map((g) => g.padStart(4, "0")).join("");
  if (!/^[0-9a-f]{32}$/i.test(full)) return null;
  return full.toLowerCase().split("").reverse().join(".") + ".ip6.arpa";
}

function reverseName(ip: string): string | null {
  return ip.includes(":") ? reverseV6(ip) : reverseV4(ip);
}

interface DohAnswer {
  name: string;
  type: number;
  TTL?: number;
  data: string;
}

interface DohResponse {
  Status: number; // 0 = NOERROR, 3 = NXDOMAIN, etc.
  Answer?: DohAnswer[];
}

async function doh(name: string, type: "PTR" | "A" | "AAAA", signal?: AbortSignal): Promise<DohResponse> {
  const url = `${DOH_ENDPOINT}?name=${encodeURIComponent(name)}&type=${type}`;
  const res = await fetch(url, {
    headers: { Accept: "application/dns-json" },
    signal,
  });
  if (!res.ok) throw new Error(`DoH HTTP ${res.status}`);
  return (await res.json()) as DohResponse;
}

function matchSuffix(hostname: string, family: "google" | "yandex"): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  const list = family === "google" ? GOOGLE_SUFFIXES : YANDEX_SUFFIXES;
  return list.some((s) => h.endsWith(s));
}

// Detect family from a hostname — cross-family claims (Googlebot resolving to yandex.com) are fake
function hostnameFamily(hostname: string): "google" | "yandex" | null {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (GOOGLE_SUFFIXES.some((s) => h.endsWith(s))) return "google";
  if (YANDEX_SUFFIXES.some((s) => h.endsWith(s))) return "yandex";
  return null;
}

// ---------------------------------------------
// Per-IP verification: PTR → forward lookup → match IP
// ---------------------------------------------
async function verifyIp(
  ip: string,
  expected: "google" | "yandex",
  signal?: AbortSignal,
): Promise<IpVerification> {
  const cached = cache.get(ip);
  if (cached) return cached;

  const ptrName = reverseName(ip);
  if (!ptrName) {
    const r: IpVerification = {
      ip, status: "error", ptr: null, chainOk: false,
      matchedFamily: null, reason: "Некорректный IP",
    };
    cache.set(ip, r);
    return r;
  }

  let ptr: string | null = null;
  try {
    const ptrResp = await doh(ptrName, "PTR", signal);
    const ptrAnswer = (ptrResp.Answer || []).find((a) => a.type === 12);
    ptr = ptrAnswer ? ptrAnswer.data.replace(/\.$/, "") : null;

    if (!ptr) {
      const r: IpVerification = {
        ip, status: "unverifiable", ptr: null, chainOk: false,
        matchedFamily: null, reason: "Нет PTR-записи",
      };
      cache.set(ip, r);
      return r;
    }
  } catch (e: any) {
    const r: IpVerification = {
      ip, status: "error", ptr: null, chainOk: false,
      matchedFamily: null, reason: `DoH: ${e?.message || "ошибка"}`,
    };
    // do NOT cache network errors — let user retry
    return r;
  }

  const family = hostnameFamily(ptr);
  if (!family) {
    const r: IpVerification = {
      ip, status: "fake", ptr, chainOk: false,
      matchedFamily: null,
      reason: "PTR не принадлежит Google/Яндекс",
    };
    cache.set(ip, r);
    return r;
  }

  // If the bot claims to be Google but PTR is yandex.ru — that's impersonation too
  if (family !== expected) {
    const r: IpVerification = {
      ip, status: "fake", ptr, chainOk: false,
      matchedFamily: family,
      reason: `PTR указывает на ${family}, а бот объявлен как ${expected}`,
    };
    cache.set(ip, r);
    return r;
  }

  // Forward lookup on the PTR name: should return the original IP
  try {
    const recordType: "A" | "AAAA" = ip.includes(":") ? "AAAA" : "A";
    const fwdResp = await doh(ptr, recordType, signal);
    const fwdIps = (fwdResp.Answer || [])
      .filter((a) => a.type === (recordType === "A" ? 1 : 28))
      .map((a) => a.data);

    const match = fwdIps.some((x) => x === ip);
    const r: IpVerification = {
      ip,
      status: match ? "verified" : "fake",
      ptr,
      chainOk: match,
      matchedFamily: family,
      reason: match
        ? undefined
        : `Forward lookup вернул ${fwdIps.join(", ") || "ничего"}, не совпадает с ${ip}`,
    };
    cache.set(ip, r);
    return r;
  } catch (e: any) {
    const r: IpVerification = {
      ip, status: "error", ptr, chainOk: false,
      matchedFamily: family,
      reason: `Forward DoH: ${e?.message || "ошибка"}`,
    };
    return r;
  }
}

// ---------------------------------------------
// Batch verification with limited concurrency
// ---------------------------------------------
export async function verifyBotIps(
  botIps: { botName: string; ips: string[]; ipCount: number }[],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<BotVerificationResult[]> {
  // Flatten into tasks
  interface Task { botName: string; family: "google" | "yandex"; ip: string; }
  const tasks: Task[] = [];
  for (const b of botIps) {
    const family = expectedFamily(b.botName);
    for (const ip of b.ips) tasks.push({ botName: b.botName, family, ip });
  }

  const total = tasks.length;
  let done = 0;
  const resultsPerTask: (IpVerification & { botName: string })[] = new Array(total);

  let cursor = 0;
  async function worker() {
    while (true) {
      if (signal?.aborted) return;
      const i = cursor++;
      if (i >= total) return;
      const t = tasks[i];
      const v = await verifyIp(t.ip, t.family, signal);
      resultsPerTask[i] = { ...v, botName: t.botName };
      done++;
      onProgress?.(done, total);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Aggregate per bot
  const byBot = new Map<string, BotVerificationResult>();
  for (const b of botIps) {
    byBot.set(b.botName, {
      botName: b.botName,
      expectedFamily: expectedFamily(b.botName),
      ipsChecked: 0,
      ipsTotal: b.ipCount,
      verified: 0,
      fake: 0,
      unverifiable: 0,
      errors: 0,
      details: [],
    });
  }
  for (const r of resultsPerTask) {
    if (!r) continue;
    const agg = byBot.get(r.botName);
    if (!agg) continue;
    agg.ipsChecked++;
    if (r.status === "verified") agg.verified++;
    else if (r.status === "fake") agg.fake++;
    else if (r.status === "unverifiable") agg.unverifiable++;
    else agg.errors++;
    agg.details.push(r);
  }
  // Sort details: fake first (highest priority), then unverifiable, then verified
  const order: Record<VerificationStatus, number> = {
    fake: 0, error: 1, unverifiable: 2, verified: 3,
  };
  for (const agg of byBot.values()) {
    agg.details.sort((a, b) => order[a.status] - order[b.status]);
  }

  return Array.from(byBot.values()).sort((a, b) => b.fake - a.fake || b.ipsTotal - a.ipsTotal);
}

// ---------------------------------------------
// Derive a single status per bot for icon display in other tables
// ---------------------------------------------
export type BotBadge = "verified" | "partial" | "fake" | "unverifiable" | "unchecked";

export function badgeForBot(
  botName: string,
  results: BotVerificationResult[] | null,
): BotBadge {
  if (!results) return "unchecked";
  const r = results.find((x) => x.botName === botName);
  if (!r || r.ipsChecked === 0) return "unchecked";
  if (r.fake > 0 && r.verified === 0) return "fake";
  if (r.fake > 0) return "partial"; // some fake, some real
  if (r.verified > 0) return "verified";
  return "unverifiable";
}
