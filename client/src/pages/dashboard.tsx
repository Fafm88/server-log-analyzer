import { useRoute, useLocation } from "wouter";
import { useMemo, useState } from "react";
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
  Download, TrendingUp, ListFilter, BugOff, X,
} from "lucide-react";
import { useLogStore } from "@/lib/log-store";
import type { UserAgentRow, DetailRow, BotErrorRow } from "@/lib/log-store";
import { VirtualTable, type VirtualColumn } from "@/components/VirtualTable";
import { downloadCSV } from "@/lib/csv";

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
  } = data;

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
            <TabsTrigger value="urls" data-testid="tab-urls">
              <Globe className="w-3.5 h-3.5 mr-1.5" />Топ URL
            </TabsTrigger>
          </TabsList>

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
                          <TableHead className="text-xs">Бот</TableHead>
                          <TableHead className="text-xs text-right">2xx</TableHead>
                          <TableHead className="text-xs text-right">3xx</TableHead>
                          <TableHead className="text-xs text-right">4xx</TableHead>
                          <TableHead className="text-xs text-right">5xx</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(botStatusMap).map(([bot, codes]) => (
                          <TableRow key={bot}>
                            <TableCell className="text-xs font-medium">{bot}</TableCell>
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
                          <TableHead className="text-xs">Бот</TableHead>
                          <TableHead className="text-xs text-right">Первая половина</TableHead>
                          <TableHead className="text-xs text-right">Вторая половина</TableHead>
                          <TableHead className="text-xs text-right">Изменение</TableHead>
                          <TableHead className="text-xs text-right">%</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {botTrends.map((t) => (
                          <TableRow key={t.bot}>
                            <TableCell className="text-xs">
                              <span className="font-medium" style={{ color: getBotColor(t.bot) }}>
                                {t.bot}
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
                          <TableHead className="text-xs">Код</TableHead>
                          <TableHead className="text-xs text-right">Количество</TableHead>
                          <TableHead className="text-xs text-right">Доля</TableHead>
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
            <UserAgentsView userAgents={userAgents} totalRequests={summary.totalRequests} />
          </TabsContent>

          {/* ================================================ */}
          {/* Details tab — UA × URL × status + filters         */}
          {/* ================================================ */}
          <TabsContent value="details" className="space-y-4">
            <DetailsView details={details} detailsTruncated={detailsTruncated} />
          </TabsContent>

          {/* ================================================ */}
          {/* Bot errors tab                                    */}
          {/* ================================================ */}
          <TabsContent value="errors" className="space-y-4">
            <BotErrorsView botErrors={botErrors} />
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
                        <TableHead className="text-xs w-[50%]">URL</TableHead>
                        <TableHead className="text-xs text-right">Всего</TableHead>
                        <TableHead className="text-xs text-right">Боты</TableHead>
                        <TableHead className="text-xs text-right">Люди</TableHead>
                        <TableHead className="text-xs text-right">Ср. код</TableHead>
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
function UserAgentsView({ userAgents, totalRequests }: {
  userAgents: UserAgentRow[]; totalRequests: number;
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
      key: "ua", header: "User-Agent", width: "minmax(260px, 3fr)",
      cell: (row) => (
        <div className="font-mono truncate" title={row.userAgent}>
          {row.userAgent || "(пусто)"}
        </div>
      ),
    },
    {
      key: "type", header: "Тип", width: "140px",
      cell: (row) => row.isBot ? (
        <Badge variant="outline" className="text-[10px] h-5 px-1.5">
          <Bot className="w-2.5 h-2.5 mr-1" />{row.botName || "Бот"}
        </Badge>
      ) : (
        <span className="text-muted-foreground text-xs">Пользователь</span>
      ),
    },
    {
      key: "count", header: "Запросы", width: "90px", align: "right",
      cell: (row) => <span className="tabular-nums font-medium">{row.count.toLocaleString("ru-RU")}</span>,
    },
    {
      key: "2xx", header: "2xx", width: "60px", align: "right",
      cell: (row) => (
        <span className="tabular-nums text-green-600 dark:text-green-400">
          {row.statusCounts["2xx"]?.toLocaleString("ru-RU") || "—"}
        </span>
      ),
    },
    {
      key: "3xx", header: "3xx", width: "60px", align: "right",
      cell: (row) => (
        <span className="tabular-nums text-primary">
          {row.statusCounts["3xx"]?.toLocaleString("ru-RU") || "—"}
        </span>
      ),
    },
    {
      key: "4xx", header: "4xx", width: "60px", align: "right",
      cell: (row) => (
        <span className="tabular-nums text-amber-600 dark:text-amber-400">
          {row.statusCounts["4xx"]?.toLocaleString("ru-RU") || "—"}
        </span>
      ),
    },
    {
      key: "5xx", header: "5xx", width: "60px", align: "right",
      cell: (row) => (
        <span className="tabular-nums text-red-600 dark:text-red-400">
          {row.statusCounts["5xx"]?.toLocaleString("ru-RU") || "—"}
        </span>
      ),
    },
    {
      key: "topUrl", header: "Самый частый URL", width: "minmax(180px, 2fr)",
      cell: (row) => (
        <div className="font-mono text-muted-foreground truncate" title={row.topUrl}>
          {row.topUrl || "—"}
        </div>
      ),
    },
    {
      key: "share", header: "Доля", width: "70px", align: "right",
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
function DetailsView({ details, detailsTruncated }: {
  details: DetailRow[]; detailsTruncated: boolean;
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
      key: "url", header: "URL", width: "minmax(200px, 2fr)",
      cell: (row) => (
        <div className="font-mono truncate" title={row.url}>{row.url}</div>
      ),
    },
    {
      key: "status", header: "Код", width: "70px", align: "center",
      cell: (row) => <StatusBadge code={row.statusCode} />,
    },
    {
      key: "type", header: "Тип", width: "140px",
      cell: (row) => row.isBot ? (
        <Badge variant="outline" className="text-[10px] h-5 px-1.5">
          <Bot className="w-2.5 h-2.5 mr-1" />{row.botName || "Бот"}
        </Badge>
      ) : (
        <span className="text-muted-foreground text-xs">Пользователь</span>
      ),
    },
    {
      key: "ua", header: "User-Agent", width: "minmax(200px, 2fr)",
      cell: (row) => (
        <div className="font-mono text-muted-foreground truncate" title={row.userAgent}>
          {row.userAgent || "(пусто)"}
        </div>
      ),
    },
    {
      key: "count", header: "Запросы", width: "90px", align: "right",
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
function BotErrorsView({ botErrors }: { botErrors: BotErrorRow[] }) {
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
      key: "url", header: "URL", width: "minmax(260px, 3fr)",
      cell: (row) => (
        <div className="font-mono truncate" title={row.url}>{row.url}</div>
      ),
    },
    {
      key: "code", header: "Код", width: "80px", align: "center",
      cell: (row) => <StatusBadge code={row.statusCode} />,
    },
    {
      key: "bot", header: "Бот", width: "150px",
      cell: (row) => (
        <span className="text-xs font-medium" style={{ color: getBotColor(row.botName) }}>
          {row.botName}
        </span>
      ),
    },
    {
      key: "count", header: "Обращений", width: "110px", align: "right",
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
