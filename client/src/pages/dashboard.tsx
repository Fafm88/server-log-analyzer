import { useRoute, useLocation } from "wouter";
import { useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend,
} from "recharts";
import {
  Bot, Globe, AlertTriangle, Activity, ArrowLeft, FileText, Search,
  Download, TrendingUp, ListFilter, BugOff, X, ShieldCheck, Loader2,
} from "lucide-react";
import { useLogStore } from "@/lib/log-store";
import type { UserAgentRow, DetailRow, BotErrorRow, BotIpsEntry } from "@/lib/log-store";
import { VirtualTable, type VirtualColumn } from "@/components/VirtualTable";
import { BotVerifyBadge } from "@/components/BotVerifyBadge";
import { ColumnHelp } from "@/components/ColumnHelp";
import { downloadCSV } from "@/lib/csv";
import {
  verifyBotIps, badgeForBot,
  type BotVerificationResult, type BotBadge, VERIFIABLE_BOTS,
} from "@/lib/bot-verifier";

// ==========================================================
// Design tokens
// ==========================================================
const CHART_COLORS = [
  "hsl(199, 89%, 40%)", "hsl(142, 71%, 38%)",
  "hsl(38, 92%, 50%)", "hsl(0, 72%, 51%)",
  "hsl(262, 83%, 48%)", "hsl(199, 60%, 55%)",
  "hsl(25, 80%, 50%)", "hsl(320, 50%, 50%)",
];

const STATUS_COLORS: Record<string, string> = {
  "2xx": "hsl(142, 71%, 38%)",
  "3xx": "hsl(199, 89%, 40%)",
  "4xx": "hsl(38, 92%, 50%)",
  "5xx": "hsl(0, 72%, 51%)",
};

const BOT_COLORS: Record<string, string> = {
  "GPTBot": "#15803d", "ChatGPT-User": "#16a34a", "OAI-SearchBot": "#5eead4",
  "ClaudeBot": "#d97706", "Claude-User": "#f59e0b", "Claude-SearchBot": "#fcd34d",
  "PerplexityBot": "#7c3aed", "Perplexity-User": "#a78bfa",
  "Googlebot": "#1d4ed8", "Google-Extended": "#60a5fa",
  "bingbot": "#0891b2",
  "YandexBot": "#dc2626", "YandexAdditionalBot": "#f87171",
  "DeepSeekBot": "#475569", "Bytespider": "#ea580c", "CCBot": "#334155",
};

function getBotColor(name: string, fallbackIndex = 0) {
  return BOT_COLORS[name] || CHART_COLORS[fallbackIndex % CHART_COLORS.length];
}

// ==========================================================
// Shared cells
// ==========================================================
function KpiCard({ icon: Icon, label, value, sub, variant }: {
  icon: any; label: string; value: string | number; sub?: string;
  variant?: "default" | "success" | "warning" | "error";
}) {
  const colorMap = {
    default: "text-primary",
    success: "text-green-600 dark:text-green-400",
    warning: "text-amber-600 dark:text-amber-400",
    error: "text-red-600 dark:text-red-400",
  };
  return (
    <Card>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`mt-0.5 ${colorMap[variant || "default"]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground font-medium">{label}</div>
          <div
            className="text-lg font-semibold tabular-nums tracking-tight"
            data-testid={`kpi-${label}`}
          >
            {typeof value === "number" ? value.toLocaleString("ru-RU") : value}
          </div>
          {sub && <div className="text-xs text-muted-foreground tabular-nums">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ code }: { code: number }) {
  const variant = code < 300 ? "default" : code < 400 ? "secondary" : code < 500 ? "outline" : "destructive";
  return <Badge variant={variant} className="tabular-nums text-xs">{code}</Badge>;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border rounded-md px-3 py-2 shadow-md text-xs">
      <div className="font-medium mb-1">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium tabular-nums">
            {Number(p.value).toLocaleString("ru-RU")}
          </span>
        </div>
      ))}
    </div>
  );
}

function DailyBotsTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p: any) => p.value > 0).sort((a: any, b: any) => b.value - a.value);
  const total = rows.reduce((s: number, r: any) => s + (r.value || 0), 0);
  return (
    <div className="bg-popover border rounded-md px-3 py-2 shadow-lg text-xs min-w-[200px]">
      <div className="font-semibold mb-1.5 tabular-nums">{label}</div>
      <div className="space-y-1">
        {rows.map((p: any, i: number) => (
          <div key={i} className="flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.color }} />
              <span className="truncate" style={{ color: p.color }}>{p.name}</span>
            </div>
            <span className="font-semibold tabular-nums ml-2">
              {Number(p.value).toLocaleString("ru-RU")}
            </span>
          </div>
        ))}
      </div>
      {rows.length > 1 && (
        <div className="mt-2 pt-1.5 border-t flex items-center justify-between">
          <span className="text-muted-foreground">Всего</span>
          <span className="font-semibold tabular-nums">{total.toLocaleString("ru-RU")}</span>
        </div>
      )}
    </div>
  );
}

// ==========================================================
// Main dashboard
// ==========================================================
export default function DashboardPage() {
  const [, params] = useRoute("/dashboard/:id");
  const [, setLocation] = useLocation();
  const sessionId = params?.id;
  const { getAnalytics } = useLogStore();
  const data = sessionId ? getAnalytics(sessionId) : null;

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertTriangle className="w-8 h-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Сессия не найдена. Загрузите лог-файл.</p>
        <Button variant="outline" size="sm" onClick={() => setLocation("/upload")}>
          Загрузить лог
        </Button>
      </div>
    );
  }

  const {
    session, summary, statusCodes, botCrawl, topUrls, hourly, statusByBot,
    userAgents, dailyBots, trackedBotsPresent, details, botErrors, detailsTruncated,
    botIps,
  } = data;

  // ----------------------------------------------------
  // Bot verification state (runs on user demand via button)
  // ----------------------------------------------------
  const [verifyState, setVerifyState] = useState<
    | { phase: "idle" }
    | { phase: "running"; done: number; total: number }
    | { phase: "done"; results: BotVerificationResult[] }
    | { phase: "error"; message: string }
  >({ phase: "idle" });

  const verifyResults = verifyState.phase === "done" ? verifyState.results : null;

  const startVerify = useCallback(async () => {
    if (!botIps || botIps.length === 0) return;
    const verifiableEntries = botIps.filter((b) => VERIFIABLE_BOTS.has(b.botName));
    if (verifiableEntries.length === 0) return;
    const total = verifiableEntries.reduce((s, b) => s + b.ips.length, 0);
    setVerifyState({ phase: "running", done: 0, total });
    try {
      const results = await verifyBotIps(verifiableEntries, (done, t) =>
        setVerifyState({ phase: "running", done, total: t }));
      setVerifyState({ phase: "done", results });
    } catch (e: any) {
      setVerifyState({ phase: "error", message: e?.message || "Ошибка проверки" });
    }
  }, [botIps]);

  // Helper: look up badge for a bot — used throughout the dashboard
  const getBadge = useCallback(
    (botName: string): BotBadge => badgeForBot(botName, verifyResults),
    [verifyResults],
  );

  const statusGroupData = Object.entries(summary.statusGroups).map(([k, v]) => ({
    name: k, value: v as number,
  }));

  const botPercentage = summary.totalRequests > 0
    ? ((summary.botRequests / summary.totalRequests) * 100).toFixed(1) : "0";
  const errorPercentage = summary.totalRequests > 0
    ? ((summary.errorRequests / summary.totalRequests) * 100).toFixed(1) : "0";

  const hourlyData = (hourly || []).map((h) => ({
    hour: h.hour?.slice(11, 13) || h.hour,
    total: h.total,
    bots: h.bots,
    users: h.total - h.bots,
  }));

  const botStatusMap: Record<string, Record<string, number>> = {};
  for (const row of statusByBot || []) {
    if (!botStatusMap[row.botName]) botStatusMap[row.botName] = {};
    const group = `${Math.floor(row.statusCode / 100)}xx`;
    botStatusMap[row.botName][group] = (botStatusMap[row.botName][group] || 0) + row.count;
  }

  const dailyChartData = useMemo(() => {
    return (dailyBots || []).map((day) => {
      const row: Record<string, any> = { date: day.date, total: day.total };
      for (const botName of trackedBotsPresent || []) {
        row[botName] = day.counts[botName] || 0;
      }
      return row;
    });
  }, [dailyBots, trackedBotsPresent]);

  const totalBotVisits = useMemo(
    () => (dailyBots || []).reduce((sum, d) => sum + d.total, 0),
    [dailyBots],
  );
  const topBot = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const d of dailyBots || []) {
      for (const [bot, c] of Object.entries(d.counts)) {
        totals[bot] = (totals[bot] || 0) + c;
      }
    }
    const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    return entries[0] || null;
  }, [dailyBots]);

  // ====================================================
  // Top URLs — also break out bot vs user ratio
  // ====================================================
  const topUrlsWithBots = useMemo(() => {
    // Build url -> botHits from detail rows
    const byUrl: Record<string, { botHits: number }> = {};
    for (const d of details || []) {
      if (d.isBot) {
        if (!byUrl[d.url]) byUrl[d.url] = { botHits: 0 };
        byUrl[d.url].botHits += d.count;
      }
    }
    return (topUrls || []).map((u) => ({
      ...u,
      botHits: byUrl[u.url]?.botHits || 0,
      humanHits: u.count - (byUrl[u.url]?.botHits || 0),
    }));
  }, [topUrls, details]);

  // ====================================================
  // Bot trends — compute day-over-day delta for tracked bots
  // ====================================================
  const botTrends = useMemo(() => {
    if (!dailyBots || dailyBots.length < 2) return [];
    // Sum first half vs second half for trend detection
    const mid = Math.floor(dailyBots.length / 2);
    const firstHalf: Record<string, number> = {};
    const secondHalf: Record<string, number> = {};
    dailyBots.slice(0, mid).forEach((d) => {
      for (const [bot, c] of Object.entries(d.counts)) {
        firstHalf[bot] = (firstHalf[bot] || 0) + c;
      }
    });
    dailyBots.slice(mid).forEach((d) => {
      for (const [bot, c] of Object.entries(d.counts)) {
        secondHalf[bot] = (secondHalf[bot] || 0) + c;
      }
    });
    const allBots = new Set([...Object.keys(firstHalf), ...Object.keys(secondHalf)]);
    return Array.from(allBots)
      .map((bot) => {
        const before = firstHalf[bot] || 0;
        const after = secondHalf[bot] || 0;
        const total = before + after;
        const delta = after - before;
        const deltaPct = before > 0 ? (delta / before) * 100 : (after > 0 ? 100 : 0);
        return { bot, before, after, total, delta, deltaPct };
      })
      .sort((a, b) => b.total - a.total);
  }, [dailyBots]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b">
        <div className="flex items-center gap-3 px-6 h-14">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")} data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium truncate">{session.filename}</span>
            <Badge variant="outline" className="text-xs shrink-0">{session.serverType}</Badge>
          </div>
          <div className="ml-auto text-xs text-muted-foreground tabular-nums">
            {session.parsedLines.toLocaleString("ru-RU")} строк
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard icon={Activity} label="Всего запросов" value={summary.totalRequests} variant="default" />
          <KpiCard icon={Bot} label="Запросы ботов" value={summary.botRequests}
            sub={`${botPercentage}% от общего`} variant="default" />
          <KpiCard icon={AlertTriangle} label="Ошибки (4xx/5xx)" value={summary.errorRequests}
            sub={`${errorPercentage}% от общего`}
            variant={Number(errorPercentage) > 10 ? "error" : "warning"} />
          <KpiCard icon={Globe} label="Уникальных URL" value={summary.uniqueUrls} variant="default" />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="crawl" className="space-y-4">
          <TabsList data-testid="tabs-navigation" className="flex-wrap h-auto">
            <TabsTrigger value="crawl" data-testid="tab-crawl">
              <Bot className="w-3.5 h-3.5 mr-1.5" />Краулинг
            </TabsTrigger>
            <TabsTrigger value="trends" data-testid="tab-trends">
              <TrendingUp className="w-3.5 h-3.5 mr-1.5" />Тренды ботов
            </TabsTrigger>
            <TabsTrigger value="status" data-testid="tab-status">
              <Activity className="w-3.5 h-3.5 mr-1.5" />Коды ответов
            </TabsTrigger>
            <TabsTrigger value="agents" data-testid="tab-agents">
              <Search className="w-3.5 h-3.5 mr-1.5" />User-Agents
            </TabsTrigger>
            <TabsTrigger value="details" data-testid="tab-details">
              <ListFilter className="w-3.5 h-3.5 mr-1.5" />Детализация
            </TabsTrigger>
            <TabsTrigger value="errors" data-testid="tab-errors">
              <BugOff className="w-3.5 h-3.5 mr-1.5" />Ошибки ботов
            </TabsTrigger>
            <TabsTrigger value="verify" data-testid="tab-verify">
              <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />Верификация
            </TabsTrigger>
            <TabsTrigger value="urls" data-testid="tab-urls">
              <Globe className="w-3.5 h-3.5 mr-1.5" />Топ URL
            </TabsTrigger>
          </TabsList>

          {/* Global verification banner — visible while data loaded but not verified yet */}
          <VerifyBanner
            state={verifyState}
            botIps={botIps}
            onStart={startVerify}
          />

          {/* ================================================ */}
          {/* Crawl tab — daily chart + bot activity + hourly */}
          {/* ================================================ */}
          <TabsContent value="crawl" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <CardTitle className="text-sm font-medium">
                      Обращения ботов по дням
                    </CardTitle>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Поисковые боты и LLM-краулеры. Наведите на столбец, чтобы увидеть разбивку.
                    </div>
                  </div>
                  {totalBotVisits > 0 && (
                    <div className="flex items-center gap-4 text-xs">
                      <div>
                        <div className="text-muted-foreground">Всего обращений</div>
                        <div className="font-semibold tabular-nums text-sm">
                          {totalBotVisits.toLocaleString("ru-RU")}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Ботов найдено</div>
                        <div className="font-semibold tabular-nums text-sm">
                          {(trackedBotsPresent || []).length}
                        </div>
                      </div>
                      {topBot && (
                        <div>
                          <div className="text-muted-foreground">Топ бот</div>
                          <div className="font-semibold text-sm"
                            style={{ color: getBotColor(topBot[0]) }}>
                            {topBot[0]}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {dailyChartData.length > 0 && (trackedBotsPresent || []).length > 0 ? (
                  <ResponsiveContainer width="100%" height={340}>
                    <BarChart data={dailyChartData} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))"
                        interval="preserveStartEnd" minTickGap={40} />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))"
                        allowDecimals={false} width={50} />
                      <Tooltip content={<DailyBotsTooltip />}
                        cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="square" iconSize={10} />
                      {(trackedBotsPresent || []).map((bot, i) => (
                        <Bar key={bot} dataKey={bot} name={bot} stackId="bots"
                          fill={getBotColor(bot, i)} maxBarSize={40} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                    Целевые боты в логе не обнаружены
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm font-medium">Активность ботов</CardTitle>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
                    onClick={() => downloadCSV("bot-activity", botCrawl, [
                      { key: "botName", label: "Бот" },
                      { key: "count", label: "Запросы" },
                      { key: "urls", label: "Уникальных URL" },
                      { key: "errors", label: "Ошибки" },
                    ])}
                    data-testid="button-export-bot-activity">
                    <Download className="w-3 h-3 mr-1" />CSV
                  </Button>
                </CardHeader>
                <CardContent>
                  {botCrawl.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={botCrawl.slice(0, 10)} layout="vertical"
                        margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                        <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis type="category" dataKey="botName" width={120}
                          tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="count" name="Запросы" fill={CHART_COLORS[0]} radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                      Боты не обнаружены
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Коды ответов по ботам</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[280px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">
                            <ColumnHelp text="Имя бота, определённое по User-Agent. Иконка слева показывает результат проверки подлинности (если проверка была запущена).">Бот</ColumnHelp>
                          </TableHead>
                          <TableHead className="text-xs text-right">
                            <ColumnHelp align="right" text="Успешные запросы (код 200–299). Норма — основная часть трафика бота должна попадать сюда.">2xx</ColumnHelp>
                          </TableHead>
                          <TableHead className="text-xs text-right">
                            <ColumnHelp align="right" text="Перенаправления (код 300–399). Много 301/302 для бота — повод проверить, не теряется ли crawl-бюджет на цепочки редиректов.">3xx</ColumnHelp>
                          </TableHead>
                          <TableHead className="text-xs text-right">
                            <ColumnHelp align="right" text="Ошибки клиента (код 400–499): 404 Not Found, 403 Forbidden и др. Критично для SEO — это URL, которые поисковик видит как битые.">4xx</ColumnHelp>
                          </TableHead>
                          <TableHead className="text-xs text-right">
                            <ColumnHelp align="right" text="Ошибки сервера (код 500–599). Очень плохо для SEO — сигнал поисковику, что сайт нестабилен.">5xx</ColumnHelp>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(botStatusMap).map(([bot, codes]) => (
                          <TableRow key={bot}>
                            <TableCell className="text-xs font-medium">
                              <span className="inline-flex items-center gap-1.5">
                                <BotVerifyBadge badge={getBadge(bot)} botName={bot} />
                                {bot}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-right tabular-nums text-green-600 dark:text-green-400">
                              {codes["2xx"]?.toLocaleString("ru-RU") || "—"}
                            </TableCell>
                            <TableCell className="text-xs text-right tabular-nums text-primary">
                              {codes["3xx"]?.toLocaleString("ru-RU") || "—"}
                            </TableCell>
                            <TableCell className="text-xs text-right tabular-nums text-amber-600 dark:text-amber-400">
                              {codes["4xx"]?.toLocaleString("ru-RU") || "—"}
                            </TableCell>
                            <TableCell className="text-xs text-right tabular-nums text-red-600 dark:text-red-400">
                              {codes["5xx"]?.toLocaleString("ru-RU") || "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                        {Object.keys(botStatusMap).length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">
                              Нет данных
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Распределение запросов по часам</CardTitle>
              </CardHeader>
              <CardContent>
                {hourlyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={hourlyData} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="hour" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="total" name="Всего" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="bots" name="Боты" stroke={CHART_COLORS[2]} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                    Нет данных
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================================================ */}
          {/* Trends tab                                        */}
          {/* ================================================ */}
          <TabsContent value="trends" className="space-y-4">
            <Card>
              <CardHeader className="pb-2 flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="text-sm font-medium">Тренды активности ботов</CardTitle>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Сравнение первой и второй половины периода. Позволяет заметить изменения crawl-бюджета.
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
                  onClick={() => downloadCSV("bot-trends", botTrends, [
                    { key: "bot", label: "Бот" },
                    { key: "before", label: "Первая половина" },
                    { key: "after", label: "Вторая половина" },
                    { key: "delta", label: "Изменение" },
                    { key: "deltaPct", label: "Изменение, %" },
                    { key: "total", label: "Всего" },
                  ])}
                  data-testid="button-export-trends">
                  <Download className="w-3 h-3 mr-1" />CSV
                </Button>
              </CardHeader>
              <CardContent>
                {botTrends.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                    Нужны данные минимум за 2 дня
                  </div>
                ) : (
                  <ScrollArea className="h-[420px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">
                            <ColumnHelp text="Имя поискового бота или LLM-краулера.">Бот</ColumnHelp>
                          </TableHead>
                          <TableHead className="text-xs text-right">
                            <ColumnHelp align="right" text="Количество запросов этого бота в первой половине анализируемого периода.">Первая половина</ColumnHelp>
                          </TableHead>
                          <TableHead className="text-xs text-right">
                            <ColumnHelp align="right" text="Количество запросов этого бота во второй половине периода.">Вторая половина</ColumnHelp>
                          </TableHead>
                          <TableHead className="text-xs text-right">
                            <ColumnHelp align="right" text="Разница между первой и второй половиной. Плюс — рост, минус — падение.">Изменение</ColumnHelp>
                          </TableHead>
                          <TableHead className="text-xs text-right">
                            <ColumnHelp align="right" text="Относительное изменение в процентах. Падение больше крупного бота на − 30 % и больше — повод проверить: мог измениться robots.txt, произойти сбой или резко урезался crawl-бюджет.">%</ColumnHelp>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {botTrends.map((t) => (
                          <TableRow key={t.bot}>
                            <TableCell className="text-xs">
                              <span className="inline-flex items-center gap-1.5">
                                <BotVerifyBadge badge={getBadge(t.bot)} botName={t.bot} />
                                <span className="font-medium" style={{ color: getBotColor(t.bot) }}>
                                  {t.bot}
                                </span>
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-right tabular-nums text-muted-foreground">
                              {t.before.toLocaleString("ru-RU")}
                            </TableCell>
                            <TableCell className="text-xs text-right tabular-nums">
                              {t.after.toLocaleString("ru-RU")}
                            </TableCell>
                            <TableCell className={`text-xs text-right tabular-nums font-medium ${
                              t.delta > 0 ? "text-green-600 dark:text-green-400" :
                              t.delta < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                            }`}>
                              {t.delta > 0 ? "+" : ""}{t.delta.toLocaleString("ru-RU")}
                            </TableCell>
                            <TableCell className={`text-xs text-right tabular-nums font-medium ${
                              t.deltaPct > 10 ? "text-green-600 dark:text-green-400" :
                              t.deltaPct < -10 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                            }`}>
                              {t.deltaPct > 0 ? "+" : ""}{t.deltaPct.toFixed(1)}%
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================================================ */}
          {/* Status codes tab                                  */}
          {/* ================================================ */}
          <TabsContent value="status" className="space-y-4">
            <div className="grid lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Распределение по группам</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-6">
                    <ResponsiveContainer width="55%" height={220}>
                      <PieChart>
                        <Pie data={statusGroupData} cx="50%" cy="50%"
                          innerRadius={50} outerRadius={85}
                          dataKey="value" nameKey="name" strokeWidth={2} stroke="hsl(var(--card))">
                          {statusGroupData.map((entry, i) => (
                            <Cell key={entry.name}
                              fill={STATUS_COLORS[entry.name] || CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-col gap-2">
                      {statusGroupData.map((entry, i) => (
                        <div key={entry.name} className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-sm shrink-0"
                            style={{ background: STATUS_COLORS[entry.name] || CHART_COLORS[i % CHART_COLORS.length] }} />
                          <span className="text-xs font-medium">{entry.name}</span>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {entry.value.toLocaleString("ru-RU")} ({((entry.value / summary.totalRequests) * 100).toFixed(1)}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm font-medium">Детальные коды</CardTitle>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
                    onClick={() => downloadCSV("status-codes",
                      statusCodes.map((s) => ({
                        code: s.statusCode, count: s.count,
                        share: ((s.count / summary.totalRequests) * 100).toFixed(2) + "%",
                      })),
                      [
                        { key: "code", label: "Код" },
                        { key: "count", label: "Количество" },
                        { key: "share", label: "Доля" },
                      ])}
                    data-testid="button-export-status">
                    <Download className="w-3 h-3 mr-1" />CSV
                  </Button>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[280px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">
                            <ColumnHelp text="Конкретный HTTP-код ответа сервера (например, 200, 301, 404, 500).">Код</ColumnHelp>
                          </TableHead>
                          <TableHead className="text-xs text-right">
                            <ColumnHelp align="right" text="Сколько раз сервер вернул этот код ответа за весь период лога.">Количество</ColumnHelp>
                          </TableHead>
                          <TableHead className="text-xs text-right">
                            <ColumnHelp align="right" text="Процент от общего числа запросов в логе.">Доля</ColumnHelp>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {statusCodes.map((row) => (
                          <TableRow key={row.statusCode}>
                            <TableCell><StatusBadge code={row.statusCode} /></TableCell>
                            <TableCell className="text-xs text-right tabular-nums">
                              {row.count.toLocaleString("ru-RU")}
                            </TableCell>
                            <TableCell className="text-xs text-right tabular-nums text-muted-foreground">
                              {((row.count / summary.totalRequests) * 100).toFixed(1)}%
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ================================================ */}
          {/* User-Agents tab — full list + filters + CSV       */}
          {/* ================================================ */}
          <TabsContent value="agents" className="space-y-4">
            <UserAgentsView
              userAgents={userAgents}
              totalRequests={summary.totalRequests}
              getBadge={getBadge}
            />
          </TabsContent>

          {/* ================================================ */}
          {/* Details tab — UA × URL × status + filters         */}
          {/* ================================================ */}
          <TabsContent value="details" className="space-y-4">
            <DetailsView
              details={details}
              detailsTruncated={detailsTruncated}
              getBadge={getBadge}
            />
          </TabsContent>

          {/* ================================================ */}
          {/* Bot errors tab                                    */}
          {/* ================================================ */}
          <TabsContent value="errors" className="space-y-4">
            <BotErrorsView botErrors={botErrors} getBadge={getBadge} />
          </TabsContent>

          <TabsContent value="verify" className="space-y-4">
            <VerifyView
              state={verifyState}
              botIps={botIps}
              onStart={startVerify}
            />
          </TabsContent>

          {/* ================================================ */}
          {/* Top URLs                                          */}
          {/* ================================================ */}
          <TabsContent value="urls" className="space-y-4">
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium">Топ-30 URL по количеству запросов</CardTitle>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
                  onClick={() => downloadCSV("top-urls", topUrlsWithBots, [
                    { key: "url", label: "URL" },
                    { key: "count", label: "Всего запросов" },
                    { key: "botHits", label: "От ботов" },
                    { key: "humanHits", label: "От людей" },
                    { key: "avgStatus", label: "Средний код" },
                  ])}
                  data-testid="button-export-urls">
                  <Download className="w-3 h-3 mr-1" />CSV
                </Button>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[480px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs w-[50%]">
                          <ColumnHelp text="Адрес страницы на вашем сайте (без домена).">URL</ColumnHelp>
                        </TableHead>
                        <TableHead className="text-xs text-right">
                          <ColumnHelp align="right" text="Общее количество запросов к этому URL от всех источников — и ботов, и людей.">Всего</ColumnHelp>
                        </TableHead>
                        <TableHead className="text-xs text-right">
                          <ColumnHelp align="right" text="Сколько из этих запросов сделали боты (поисковые, LLM, другие). Высокая доля ботов + низкая доля людей может означать, что страница не ищется пользователями.">Боты</ColumnHelp>
                        </TableHead>
                        <TableHead className="text-xs text-right">
                          <ColumnHelp align="right" text="Сколько запросов сделали реальные пользователи (все, кто не опознан как бот). Высокое число = страница имеет реальный трафик.">Люди</ColumnHelp>
                        </TableHead>
                        <TableHead className="text-xs text-right">
                          <ColumnHelp align="right" text="Средний HTTP-код для этого URL. Норма — близко к 200. Значения 300+ указывают, что страница иногда отдаёт редиректы или ошибки.">Ср. код</ColumnHelp>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topUrlsWithBots.map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="py-2">
                            <div className="text-xs font-mono max-w-[500px] truncate" title={row.url}>
                              {row.url}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-right tabular-nums">
                            {row.count.toLocaleString("ru-RU")}
                          </TableCell>
                          <TableCell className="text-xs text-right tabular-nums text-primary">
                            {row.botHits.toLocaleString("ru-RU")}
                          </TableCell>
                          <TableCell className="text-xs text-right tabular-nums text-muted-foreground">
                            {row.humanHits.toLocaleString("ru-RU")}
                          </TableCell>
                          <TableCell className="text-xs text-right">
                            <StatusBadge code={row.avgStatus} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ==========================================================
// User-Agents view — all rows, filterable, exportable
// ==========================================================
function UserAgentsView({ userAgents, totalRequests, getBadge }: {
  userAgents: UserAgentRow[]; totalRequests: number;
  getBadge: (botName: string) => BotBadge;
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all"); // all, bots, humans, or specific botName
  const [statusFilter, setStatusFilter] = useState<string>("all"); // all, 2xx, 3xx, 4xx, 5xx

  // List of unique bot names for filter dropdown
  const botNames = useMemo(() => {
    const set = new Set<string>();
    for (const ua of userAgents) if (ua.botName) set.add(ua.botName);
    return Array.from(set).sort();
  }, [userAgents]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return userAgents.filter((row) => {
      // Type filter
      if (typeFilter === "bots" && !row.isBot) return false;
      if (typeFilter === "humans" && row.isBot) return false;
      if (typeFilter !== "all" && typeFilter !== "bots" && typeFilter !== "humans") {
        if (row.botName !== typeFilter) return false;
      }
      // Status filter — require the UA has at least one request in that group
      if (statusFilter !== "all") {
        if (!row.statusCounts[statusFilter]) return false;
      }
      // Search
      if (q && !row.userAgent.toLowerCase().includes(q) && !(row.botName || "").toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [userAgents, search, typeFilter, statusFilter]);

  const filteredSum = useMemo(
    () => filtered.reduce((sum, r) => sum + r.count, 0),
    [filtered],
  );

  const columns: VirtualColumn<UserAgentRow>[] = [
    {
      key: "ua",
      header: <ColumnHelp text="Строка User-Agent — как браузер или бот представился серверу. Может быть поддельным — запустите проверку подлинности, чтобы проверить.">User-Agent</ColumnHelp>,
      width: "minmax(260px, 3fr)",
      cell: (row) => (
        <div className="font-mono truncate" title={row.userAgent}>
          {row.userAgent || "(пусто)"}
        </div>
      ),
    },
    {
      key: "type",
      header: <ColumnHelp text="Определение типа агента по сигнатуре в User-Agent. «Бот» с указанием названия — узнанный краулер, «Пользователь» — обычный браузер.">Тип</ColumnHelp>,
      width: "160px",
      cell: (row) => row.isBot ? (
        <span className="inline-flex items-center gap-1.5">
          {row.botName && <BotVerifyBadge badge={getBadge(row.botName)} botName={row.botName} />}
          <Badge variant="outline" className="text-[10px] h-5 px-1.5">
            <Bot className="w-2.5 h-2.5 mr-1" />{row.botName || "Бот"}
          </Badge>
        </span>
      ) : (
        <span className="text-muted-foreground text-xs">Пользователь</span>
      ),
    },
    {
      key: "count",
      header: <ColumnHelp align="right" text="Общее число запросов с этим User-Agent за период.">Запросы</ColumnHelp>,
      width: "90px", align: "right",
      cell: (row) => <span className="tabular-nums font-medium">{row.count.toLocaleString("ru-RU")}</span>,
    },
    {
      key: "2xx",
      header: <ColumnHelp align="right" text="Успешные ответы (200–299) для этого агента.">2xx</ColumnHelp>,
      width: "60px", align: "right",
      cell: (row) => (
        <span className="tabular-nums text-green-600 dark:text-green-400">
          {row.statusCounts["2xx"]?.toLocaleString("ru-RU") || "—"}
        </span>
      ),
    },
    {
      key: "3xx",
      header: <ColumnHelp align="right" text="Перенаправления (300–399) для этого агента.">3xx</ColumnHelp>,
      width: "60px", align: "right",
      cell: (row) => (
        <span className="tabular-nums text-primary">
          {row.statusCounts["3xx"]?.toLocaleString("ru-RU") || "—"}
        </span>
      ),
    },
    {
      key: "4xx",
      header: <ColumnHelp align="right" text="Ошибки клиента (400–499) для этого агента. Часто 404 — битые URL.">4xx</ColumnHelp>,
      width: "60px", align: "right",
      cell: (row) => (
        <span className="tabular-nums text-amber-600 dark:text-amber-400">
          {row.statusCounts["4xx"]?.toLocaleString("ru-RU") || "—"}
        </span>
      ),
    },
    {
      key: "5xx",
      header: <ColumnHelp align="right" text="Ошибки сервера (500–599) для этого агента.">5xx</ColumnHelp>,
      width: "60px", align: "right",
      cell: (row) => (
        <span className="tabular-nums text-red-600 dark:text-red-400">
          {row.statusCounts["5xx"]?.toLocaleString("ru-RU") || "—"}
        </span>
      ),
    },
    {
      key: "topUrl",
      header: <ColumnHelp text="URL, к которому этот агент обращался чаще всего. Полезно, чтобы понять, на чём фокусируется краулер.">Самый частый URL</ColumnHelp>,
      width: "minmax(180px, 2fr)",
      cell: (row) => (
        <div className="font-mono text-muted-foreground truncate" title={row.topUrl}>
          {row.topUrl || "—"}
        </div>
      ),
    },
    {
      key: "share",
      header: <ColumnHelp align="right" text="Доля запросов этого агента от всего трафика.">Доля</ColumnHelp>,
      width: "70px", align: "right",
      cell: (row) => (
        <span className="tabular-nums text-muted-foreground">
          {((row.count / totalRequests) * 100).toFixed(1)}%
        </span>
      ),
    },
  ];

  const onExport = () => {
    downloadCSV("user-agents", filtered.map((r) => ({
      userAgent: r.userAgent,
      type: r.isBot ? (r.botName || "Бот") : "Пользователь",
      count: r.count,
      status_2xx: r.statusCounts["2xx"] || 0,
      status_3xx: r.statusCounts["3xx"] || 0,
      status_4xx: r.statusCounts["4xx"] || 0,
      status_5xx: r.statusCounts["5xx"] || 0,
      topUrl: r.topUrl,
      topUrlCount: r.topUrlCount,
    })), [
      { key: "userAgent", label: "User-Agent" },
      { key: "type", label: "Тип" },
      { key: "count", label: "Запросы" },
      { key: "status_2xx", label: "2xx" },
      { key: "status_3xx", label: "3xx" },
      { key: "status_4xx", label: "4xx" },
      { key: "status_5xx", label: "5xx" },
      { key: "topUrl", label: "Самый частый URL" },
      { key: "topUrlCount", label: "Запросов на этот URL" },
    ]);
  };

  return (
    <Card>
      <CardHeader className="pb-3 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-sm font-medium">
              Все User-Agent ({userAgents.length.toLocaleString("ru-RU")})
            </CardTitle>
            <div className="text-xs text-muted-foreground mt-0.5">
              Все уникальные агенты. Используйте фильтры или поиск.
            </div>
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs"
            onClick={onExport} data-testid="button-export-agents">
            <Download className="w-3.5 h-3.5 mr-1.5" />Экспорт CSV ({filtered.length.toLocaleString("ru-RU")})
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Поиск по User-Agent или боту…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
              data-testid="input-agents-search"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px] h-8 text-xs" data-testid="select-agents-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все агенты</SelectItem>
              <SelectItem value="bots">Только боты</SelectItem>
              <SelectItem value="humans">Только пользователи</SelectItem>
              {botNames.length > 0 && (
                <>
                  <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground border-t mt-1">
                    Конкретный бот
                  </div>
                  {botNames.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="select-agents-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все коды</SelectItem>
              <SelectItem value="2xx">2xx — успех</SelectItem>
              <SelectItem value="3xx">3xx — редиректы</SelectItem>
              <SelectItem value="4xx">4xx — ошибки клиента</SelectItem>
              <SelectItem value="5xx">5xx — ошибки сервера</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="text-xs text-muted-foreground tabular-nums">
          Показано: <span className="font-medium text-foreground">{filtered.length.toLocaleString("ru-RU")}</span> агентов ·
          запросов: <span className="font-medium text-foreground">{filteredSum.toLocaleString("ru-RU")}</span>
        </div>
      </CardHeader>
      <CardContent>
        <VirtualTable
          rows={filtered}
          columns={columns}
          rowHeight={40}
          height={520}
          emptyMessage="Ничего не найдено"
          getRowKey={(r, i) => r.userAgent + "|" + i}
          testId="table-agents"
        />
      </CardContent>
    </Card>
  );
}

// ==========================================================
// Details view — UA × URL × status code
// ==========================================================
function DetailsView({ details, detailsTruncated, getBadge }: {
  details: DetailRow[]; detailsTruncated: boolean;
  getBadge: (botName: string) => BotBadge;
}) {
  const [uaSearch, setUaSearch] = useState("");
  const [urlSearch, setUrlSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const botNames = useMemo(() => {
    const set = new Set<string>();
    for (const d of details) if (d.botName) set.add(d.botName);
    return Array.from(set).sort();
  }, [details]);

  const filtered = useMemo(() => {
    const uq = uaSearch.trim().toLowerCase();
    const urlq = urlSearch.trim().toLowerCase();
    return details.filter((d) => {
      if (typeFilter === "bots" && !d.isBot) return false;
      if (typeFilter === "humans" && d.isBot) return false;
      if (typeFilter !== "all" && typeFilter !== "bots" && typeFilter !== "humans") {
        if (d.botName !== typeFilter) return false;
      }
      if (statusFilter !== "all") {
        const group = `${Math.floor(d.statusCode / 100)}xx`;
        if (group !== statusFilter) return false;
      }
      if (uq && !d.userAgent.toLowerCase().includes(uq) && !(d.botName || "").toLowerCase().includes(uq)) {
        return false;
      }
      if (urlq && !d.url.toLowerCase().includes(urlq)) return false;
      return true;
    });
  }, [details, uaSearch, urlSearch, typeFilter, statusFilter]);

  const filteredSum = useMemo(
    () => filtered.reduce((sum, r) => sum + r.count, 0),
    [filtered],
  );

  const columns: VirtualColumn<DetailRow>[] = [
    {
      key: "url",
      header: <ColumnHelp text="Адрес страницы на вашем сайте.">URL</ColumnHelp>,
      width: "minmax(200px, 2fr)",
      cell: (row) => (
        <div className="font-mono truncate" title={row.url}>{row.url}</div>
      ),
    },
    {
      key: "status",
      header: <ColumnHelp align="center" text="HTTP-код ответа сервера для этой комбинации URL+User-Agent.">Код</ColumnHelp>,
      width: "70px", align: "center",
      cell: (row) => <StatusBadge code={row.statusCode} />,
    },
    {
      key: "type",
      header: <ColumnHelp text="Тип агента: бот с указанием названия или обычный пользователь.">Тип</ColumnHelp>,
      width: "160px",
      cell: (row) => row.isBot ? (
        <span className="inline-flex items-center gap-1.5">
          {row.botName && <BotVerifyBadge badge={getBadge(row.botName)} botName={row.botName} />}
          <Badge variant="outline" className="text-[10px] h-5 px-1.5">
            <Bot className="w-2.5 h-2.5 mr-1" />{row.botName || "Бот"}
          </Badge>
        </span>
      ) : (
        <span className="text-muted-foreground text-xs">Пользователь</span>
      ),
    },
    {
      key: "ua",
      header: <ColumnHelp text="Полная строка User-Agent, которую передал клиент.">User-Agent</ColumnHelp>,
      width: "minmax(200px, 2fr)",
      cell: (row) => (
        <div className="font-mono text-muted-foreground truncate" title={row.userAgent}>
          {row.userAgent || "(пусто)"}
        </div>
      ),
    },
    {
      key: "count",
      header: <ColumnHelp align="right" text="Сколько раз встречалась именно эта комбинация URL + код + User-Agent.">Запросы</ColumnHelp>,
      width: "90px", align: "right",
      cell: (row) => (
        <span className="tabular-nums font-medium">{row.count.toLocaleString("ru-RU")}</span>
      ),
    },
  ];

  const onExport = () => {
    downloadCSV("details", filtered.map((d) => ({
      url: d.url,
      status: d.statusCode,
      type: d.isBot ? (d.botName || "Бот") : "Пользователь",
      userAgent: d.userAgent,
      count: d.count,
    })), [
      { key: "url", label: "URL" },
      { key: "status", label: "Код" },
      { key: "type", label: "Тип" },
      { key: "userAgent", label: "User-Agent" },
      { key: "count", label: "Запросы" },
    ]);
  };

  return (
    <Card>
      <CardHeader className="pb-3 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-sm font-medium">Детализация запросов</CardTitle>
            <div className="text-xs text-muted-foreground mt-0.5">
              Комбинации «User-Agent × URL × код». Используйте для глубокого разбора поведения ботов и поиска по URL.
            </div>
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs"
            onClick={onExport} data-testid="button-export-details">
            <Download className="w-3.5 h-3.5 mr-1.5" />Экспорт CSV ({filtered.length.toLocaleString("ru-RU")})
          </Button>
        </div>

        {detailsTruncated && (
          <div className="flex items-start gap-2 p-2 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Данные урезаны из-за большого количества уникальных комбинаций.
              Показаны наиболее частые — для полного анализа используйте поиск и фильтры.
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Поиск по URL…"
              value={urlSearch}
              onChange={(e) => setUrlSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
              data-testid="input-details-url"
            />
            {urlSearch && (
              <button
                onClick={() => setUrlSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Поиск по User-Agent…"
              value={uaSearch}
              onChange={(e) => setUaSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
              data-testid="input-details-ua"
            />
            {uaSearch && (
              <button
                onClick={() => setUaSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все агенты</SelectItem>
              <SelectItem value="bots">Только боты</SelectItem>
              <SelectItem value="humans">Только пользователи</SelectItem>
              {botNames.length > 0 && (
                <>
                  <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground border-t mt-1">
                    Конкретный бот
                  </div>
                  {botNames.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все коды</SelectItem>
              <SelectItem value="2xx">2xx</SelectItem>
              <SelectItem value="3xx">3xx</SelectItem>
              <SelectItem value="4xx">4xx</SelectItem>
              <SelectItem value="5xx">5xx</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="text-xs text-muted-foreground tabular-nums">
          Показано: <span className="font-medium text-foreground">{filtered.length.toLocaleString("ru-RU")}</span> строк ·
          запросов: <span className="font-medium text-foreground">{filteredSum.toLocaleString("ru-RU")}</span>
        </div>
      </CardHeader>
      <CardContent>
        <VirtualTable
          rows={filtered}
          columns={columns}
          rowHeight={40}
          height={540}
          emptyMessage={details.length === 0 ? "Нет данных" : "Ничего не найдено"}
          getRowKey={(_r, i) => i}
          testId="table-details"
        />
      </CardContent>
    </Card>
  );
}

// ==========================================================
// Bot errors view
// ==========================================================
function BotErrorsView({ botErrors, getBadge }: {
  botErrors: BotErrorRow[];
  getBadge: (botName: string) => BotBadge;
}) {
  const [urlSearch, setUrlSearch] = useState("");
  const [botFilter, setBotFilter] = useState<string>("all");
  const [codeFilter, setCodeFilter] = useState<string>("all");

  const botNames = useMemo(() => {
    const set = new Set<string>();
    for (const e of botErrors) set.add(e.botName);
    return Array.from(set).sort();
  }, [botErrors]);

  const filtered = useMemo(() => {
    const urlq = urlSearch.trim().toLowerCase();
    return botErrors.filter((e) => {
      if (botFilter !== "all" && e.botName !== botFilter) return false;
      if (codeFilter === "4xx" && (e.statusCode < 400 || e.statusCode >= 500)) return false;
      if (codeFilter === "5xx" && e.statusCode < 500) return false;
      if (codeFilter !== "all" && codeFilter !== "4xx" && codeFilter !== "5xx") {
        if (e.statusCode !== parseInt(codeFilter, 10)) return false;
      }
      if (urlq && !e.url.toLowerCase().includes(urlq)) return false;
      return true;
    });
  }, [botErrors, urlSearch, botFilter, codeFilter]);

  const filteredSum = useMemo(() => filtered.reduce((s, r) => s + r.count, 0), [filtered]);

  // Build distinct codes for filter
  const codeOptions = useMemo(() => {
    const set = new Set<number>();
    for (const e of botErrors) set.add(e.statusCode);
    return Array.from(set).sort();
  }, [botErrors]);

  const columns: VirtualColumn<BotErrorRow>[] = [
    {
      key: "url",
      header: <ColumnHelp text="URL, который отдал ошибку поисковому боту. Кандидаты на удаление или исправление.">URL</ColumnHelp>,
      width: "minmax(260px, 3fr)",
      cell: (row) => (
        <div className="font-mono truncate" title={row.url}>{row.url}</div>
      ),
    },
    {
      key: "code",
      header: <ColumnHelp align="center" text="HTTP-код ошибки. 404 — страница не найдена, 403 — запрет, 500 — ошибка сервера.">Код</ColumnHelp>,
      width: "80px", align: "center",
      cell: (row) => <StatusBadge code={row.statusCode} />,
    },
    {
      key: "bot",
      header: <ColumnHelp text="Какой бот получил эту ошибку. Иконка слева показывает результат проверки подлинности.">Бот</ColumnHelp>,
      width: "170px",
      cell: (row) => (
        <span className="inline-flex items-center gap-1.5">
          <BotVerifyBadge badge={getBadge(row.botName)} botName={row.botName} />
          <span className="text-xs font-medium" style={{ color: getBotColor(row.botName) }}>
            {row.botName}
          </span>
        </span>
      ),
    },
    {
      key: "count",
      header: <ColumnHelp align="right" text="Сколько раз бот генерировал этот код ошибки на этом URL. Частые 404 у бота — сигнал, что на страницу есть внутренние ссылки или она в sitemap.">Обращений</ColumnHelp>,
      width: "110px", align: "right",
      cell: (row) => (
        <span className="tabular-nums font-medium">{row.count.toLocaleString("ru-RU")}</span>
      ),
    },
  ];

  const onExport = () => {
    downloadCSV("bot-errors", filtered.map((e) => ({
      url: e.url,
      code: e.statusCode,
      bot: e.botName,
      count: e.count,
    })), [
      { key: "url", label: "URL" },
      { key: "code", label: "Код" },
      { key: "bot", label: "Бот" },
      { key: "count", label: "Обращений" },
    ]);
  };

  return (
    <Card>
      <CardHeader className="pb-3 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-sm font-medium">Ошибки у ботов</CardTitle>
            <div className="text-xs text-muted-foreground mt-0.5">
              Какие URL отдают 4xx или 5xx поисковым ботам. Критично для SEO — это битые ссылки,
              которые видят именно поисковики.
            </div>
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs"
            onClick={onExport} data-testid="button-export-bot-errors">
            <Download className="w-3.5 h-3.5 mr-1.5" />Экспорт CSV ({filtered.length.toLocaleString("ru-RU")})
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Поиск по URL…"
              value={urlSearch}
              onChange={(e) => setUrlSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
              data-testid="input-errors-url"
            />
            {urlSearch && (
              <button
                onClick={() => setUrlSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <Select value={botFilter} onValueChange={setBotFilter}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все боты</SelectItem>
              {botNames.map((b) => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={codeFilter} onValueChange={setCodeFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все ошибки</SelectItem>
              <SelectItem value="4xx">4xx</SelectItem>
              <SelectItem value="5xx">5xx</SelectItem>
              {codeOptions.map((c) => (
                <SelectItem key={c} value={String(c)}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="text-xs text-muted-foreground tabular-nums">
          Показано: <span className="font-medium text-foreground">{filtered.length.toLocaleString("ru-RU")}</span> строк ·
          всего обращений с ошибкой: <span className="font-medium text-foreground">{filteredSum.toLocaleString("ru-RU")}</span>
        </div>
      </CardHeader>
      <CardContent>
        <VirtualTable
          rows={filtered}
          columns={columns}
          rowHeight={40}
          height={540}
          emptyMessage={botErrors.length === 0 ? "У ботов нет ошибок — всё чисто" : "Ничего не найдено"}
          getRowKey={(_r, i) => i}
          testId="table-errors"
        />
      </CardContent>
    </Card>
  );
}

// ==========================================================
// Verify banner — compact CTA shown above tabs
// ==========================================================
type VerifyPhase =
  | { phase: "idle" }
  | { phase: "running"; done: number; total: number }
  | { phase: "done"; results: BotVerificationResult[] }
  | { phase: "error"; message: string };

function VerifyBanner({ state, botIps, onStart }: {
  state: VerifyPhase;
  botIps: BotIpsEntry[];
  onStart: () => void;
}) {
  const verifiable = botIps.filter((b) => VERIFIABLE_BOTS.has(b.botName));
  if (verifiable.length === 0) return null;

  if (state.phase === "idle") {
    const totalIps = verifiable.reduce((s, b) => s + b.ips.length, 0);
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
        <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
        <div className="text-xs flex-1">
          <div className="font-medium text-foreground">Проверить подлинность ботов</div>
          <div className="text-muted-foreground">
            В логе найдено {verifiable.length} {verifiable.length === 1 ? "поисковых бота" : "поисковых ботов"}.
            Можем проверить их настоящие IP через DNS-over-HTTPS ({totalIps} {totalIps === 1 ? "IP" : "IP"}).
          </div>
        </div>
        <Button size="sm" className="h-8 text-xs shrink-0" onClick={onStart} data-testid="button-verify-start">
          Проверить
        </Button>
      </div>
    );
  }

  if (state.phase === "running") {
    const pct = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0;
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
        <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
        <div className="text-xs flex-1">
          <div className="font-medium">Проверка ботов… {pct}%</div>
          <div className="text-muted-foreground tabular-nums">
            {state.done.toLocaleString("ru-RU")} из {state.total.toLocaleString("ru-RU")} IP
          </div>
        </div>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg border bg-destructive/10 text-destructive">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <div className="text-xs flex-1">Ошибка проверки: {state.message}</div>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onStart}>
          Повторить
        </Button>
      </div>
    );
  }

  // done — show summary
  const totalFake = state.results.reduce((s, r) => s + r.fake, 0);
  const totalVerified = state.results.reduce((s, r) => s + r.verified, 0);
  const totalChecked = state.results.reduce((s, r) => s + r.ipsChecked, 0);

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
      <ShieldCheck className={`w-4 h-4 shrink-0 ${
        totalFake > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
      }`} />
      <div className="text-xs flex-1">
        <div className="font-medium">Проверка завершена</div>
        <div className="text-muted-foreground">
          Настоящих: <span className="font-medium text-green-600 dark:text-green-400">{totalVerified}</span> ·
          {" "}Поддельных: <span className="font-medium text-red-600 dark:text-red-400">{totalFake}</span> ·
          {" "}Всего IP: <span className="tabular-nums">{totalChecked.toLocaleString("ru-RU")}</span>
          {" "}· Подробности — на вкладке «Верификация».
        </div>
      </div>
    </div>
  );
}

// ==========================================================
// Verify view — full per-bot report and per-IP breakdown
// ==========================================================
function VerifyView({ state, botIps, onStart }: {
  state: VerifyPhase;
  botIps: BotIpsEntry[];
  onStart: () => void;
}) {
  const verifiable = botIps.filter((b) => VERIFIABLE_BOTS.has(b.botName));

  if (verifiable.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          В логе не найдено поисковых ботов Google или Яндекса — проверять нечего.
        </CardContent>
      </Card>
    );
  }

  if (state.phase !== "done") {
    // Idle / running / error — show explanation + CTA
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Верификация ботов
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground space-y-2 max-w-2xl">
            <p>
              Любой парсер может представиться Googlebot или YandexBot. Чтобы отличить
              настоящего поискового бота от подделки, поисковики рекомендуют проверку
              через обратный DNS-запрос и прямой DNS-запрос обратно к IP.
            </p>
            <p>
              У настоящего Googlebot reverse DNS заканчивается на{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">.googlebot.com</code>,{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">.google.com</code> или{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">.googleusercontent.com</code>.
              У Яндекса —{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">.yandex.ru</code>,{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">.yandex.net</code> или{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">.yandex.com</code>.
            </p>
            <p className="text-xs">
              Проверка использует DNS-over-HTTPS (Cloudflare 1.1.1.1) — из ваших логов
              уходят только IP-адреса для DNS-запросов. Сами логи, URL и User-Agent
              остаются в браузере.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg border bg-card">
              <div className="text-xs text-muted-foreground">Ботов на проверку</div>
              <div className="text-lg font-semibold tabular-nums">{verifiable.length}</div>
            </div>
            <div className="p-3 rounded-lg border bg-card">
              <div className="text-xs text-muted-foreground">Уникальных IP</div>
              <div className="text-lg font-semibold tabular-nums">
                {verifiable.reduce((s, b) => s + b.ipCount, 0).toLocaleString("ru-RU")}
              </div>
            </div>
            <div className="p-3 rounded-lg border bg-card">
              <div className="text-xs text-muted-foreground">К проверке</div>
              <div className="text-lg font-semibold tabular-nums">
                {verifiable.reduce((s, b) => s + b.ips.length, 0).toLocaleString("ru-RU")}
              </div>
            </div>
            <div className="p-3 rounded-lg border bg-card">
              <div className="text-xs text-muted-foreground">Метод</div>
              <div className="text-sm font-semibold">DoH (Cloudflare)</div>
            </div>
          </div>

          {state.phase === "idle" && (
            <Button onClick={onStart} data-testid="button-verify-start-tab">
              <ShieldCheck className="w-4 h-4 mr-2" />Начать проверку
            </Button>
          )}
          {state.phase === "running" && (
            <div className="flex items-center gap-3">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <div className="text-sm tabular-nums">
                {state.done.toLocaleString("ru-RU")} из {state.total.toLocaleString("ru-RU")} IP
                ({state.total > 0 ? Math.round((state.done / state.total) * 100) : 0}%)
              </div>
            </div>
          )}
          {state.phase === "error" && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-destructive">Ошибка: {state.message}</span>
              <Button size="sm" onClick={onStart}>Повторить</Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Done — summary per bot + details
  const results = state.results;
  const totalVerified = results.reduce((s, r) => s + r.verified, 0);
  const totalFake = results.reduce((s, r) => s + r.fake, 0);
  const totalUnver = results.reduce((s, r) => s + r.unverifiable, 0);
  const totalErrors = results.reduce((s, r) => s + r.errors, 0);
  const totalChecked = results.reduce((s, r) => s + r.ipsChecked, 0);

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-sm font-medium">Итог проверки</CardTitle>
            <div className="text-xs text-muted-foreground mt-0.5">
              Проверено {totalChecked.toLocaleString("ru-RU")} IP по {results.length} ботам через DNS-over-HTTPS
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              const flat = results.flatMap((r) =>
                r.details.map((d) => ({
                  bot: r.botName,
                  ip: d.ip,
                  status: d.status,
                  ptr: d.ptr || "",
                  reason: d.reason || "",
                }))
              );
              downloadCSV("bot-verification", flat, [
                { key: "bot", label: "Бот" },
                { key: "ip", label: "IP" },
                { key: "status", label: "Статус" },
                { key: "ptr", label: "PTR" },
                { key: "reason", label: "Причина" },
              ]);
            }}
            data-testid="button-export-verify"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />Экспорт CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <VerifyStat label="Настоящие" value={totalVerified} color="text-green-600 dark:text-green-400" />
            <VerifyStat label="Поддельные" value={totalFake} color="text-red-600 dark:text-red-400" />
            <VerifyStat label="Нельзя проверить" value={totalUnver} color="text-muted-foreground" />
            <VerifyStat label="Ошибки сети" value={totalErrors} color="text-amber-600 dark:text-amber-400" />
          </div>
        </CardContent>
      </Card>

      {/* Per-bot breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">По каждому боту</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">
                  <ColumnHelp text="Имя поискового бота, заявленное в логах.">Бот</ColumnHelp>
                </TableHead>
                <TableHead className="text-xs text-right">
                  <ColumnHelp align="right" text="Общее число уникальных IP-адресов, с которых этот бот обращался за период лога.">Всего IP</ColumnHelp>
                </TableHead>
                <TableHead className="text-xs text-right">
                  <ColumnHelp align="right" text="Сколько IP было реально проверено через DNS-запросы. Проверяются до 200 самых активных IP на каждый бот.">Проверено</ColumnHelp>
                </TableHead>
                <TableHead className="text-xs text-right text-green-700 dark:text-green-400">
                  <ColumnHelp align="right" text="IP, у которых цепочка reverse DNS → forward DNS сошлась и имя хоста принадлежит нужному поисковику (googlebot.com / google.com / yandex.ru и т.д.). Это действительно бот, за которого он себя выдаёт.">Настоящих</ColumnHelp>
                </TableHead>
                <TableHead className="text-xs text-right text-red-700 dark:text-red-400">
                  <ColumnHelp align="right" text="IP, которые выдают себя за поискового бота, но DNS-проверка выяснила, что это не так. Обычно это парсеры и сканеры. Их можно смело блокировать.">Поддельных</ColumnHelp>
                </TableHead>
                <TableHead className="text-xs text-right text-muted-foreground">
                  <ColumnHelp align="right" text="IP, у которых нет PTR-записи. PTR (Pointer Record) — это обратная DNS-запись, связывающая IP с доменом. Без неё нельзя однозначно сказать, подделка это или нет, но настоящие Googlebot/YandexBot всегда имеют PTR.">Без PTR</ColumnHelp>
                </TableHead>
                <TableHead className="text-xs text-right text-amber-700 dark:text-amber-400">
                  <ColumnHelp align="right" text="IP, которые не удалось проверить из-за сетевых ошибок (timeout, недоступен DNS-сервер). Можно повторить проверку.">Ошибки</ColumnHelp>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((r) => {
                const badge: BotBadge = r.fake > 0 && r.verified === 0
                  ? "fake"
                  : r.fake > 0 ? "partial"
                  : r.verified > 0 ? "verified"
                  : "unverifiable";
                return (
                  <TableRow key={r.botName}>
                    <TableCell className="text-xs">
                      <span className="inline-flex items-center gap-1.5">
                        <BotVerifyBadge badge={badge} botName={r.botName} />
                        <span className="font-medium" style={{ color: getBotColor(r.botName) }}>
                          {r.botName}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{r.ipsTotal.toLocaleString("ru-RU")}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{r.ipsChecked.toLocaleString("ru-RU")}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums text-green-600 dark:text-green-400">
                      {r.verified > 0 ? r.verified.toLocaleString("ru-RU") : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums text-red-600 dark:text-red-400">
                      {r.fake > 0 ? r.fake.toLocaleString("ru-RU") : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums text-muted-foreground">
                      {r.unverifiable > 0 ? r.unverifiable.toLocaleString("ru-RU") : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums text-amber-600 dark:text-amber-400">
                      {r.errors > 0 ? r.errors.toLocaleString("ru-RU") : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail rows — show fake IPs prominently */}
      {totalFake > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
              Поддельные IP
            </CardTitle>
            <div className="text-xs text-muted-foreground mt-0.5">
              IP-адреса, которые выдают себя за поисковых ботов, но не прошли DNS-проверку.
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[360px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">
                      <ColumnHelp text="Бот, за которого себя выдаёт IP (значение из User-Agent). Реально он им не является.">Бот (объявлен)</ColumnHelp>
                    </TableHead>
                    <TableHead className="text-xs">
                      <ColumnHelp text="IP-адрес из логов, который обращался к вашему сайту.">IP</ColumnHelp>
                    </TableHead>
                    <TableHead className="text-xs">
                      <ColumnHelp text="Домен, который возвращает обратный DNS-запрос (PTR-запись) по этому IP. Настоящий Googlebot возвращает адрес вида *.googlebot.com; YandexBot — *.yandex.ru/.net/.com.">PTR</ColumnHelp>
                    </TableHead>
                    <TableHead className="text-xs">
                      <ColumnHelp text="Почему этот IP признан подделкой.">Причина</ColumnHelp>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.flatMap((r) =>
                    r.details
                      .filter((d) => d.status === "fake")
                      .map((d, i) => (
                        <TableRow key={`${r.botName}-${d.ip}-${i}`}>
                          <TableCell className="text-xs font-medium">{r.botName}</TableCell>
                          <TableCell className="text-xs font-mono">{d.ip}</TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">
                            {d.ptr || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[400px]">
                            {d.reason || "—"}
                          </TableCell>
                        </TableRow>
                      ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function VerifyStat({ label, value, color }: {
  label: string; value: number; color: string;
}) {
  return (
    <div className="p-3 rounded-lg border bg-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${color}`}>
        {value.toLocaleString("ru-RU")}
      </div>
    </div>
  );
}
