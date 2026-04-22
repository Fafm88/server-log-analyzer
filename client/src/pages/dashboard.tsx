import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend,
} from "recharts";
import { useMemo } from "react";
import {
  Bot, Globe, AlertTriangle, Activity, ArrowLeft, FileText, Search,
} from "lucide-react";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import { useLogStore } from "@/lib/log-store";

const CHART_COLORS = [
  "hsl(199, 89%, 40%)",
  "hsl(142, 71%, 38%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 72%, 51%)",
  "hsl(262, 83%, 48%)",
  "hsl(199, 60%, 55%)",
  "hsl(25, 80%, 50%)",
  "hsl(320, 50%, 50%)",
];

const STATUS_COLORS: Record<string, string> = {
  "2xx": "hsl(142, 71%, 38%)",
  "3xx": "hsl(199, 89%, 40%)",
  "4xx": "hsl(38, 92%, 50%)",
  "5xx": "hsl(0, 72%, 51%)",
};

// Stable color palette for tracked bots — each bot always gets the same color.
// Ordered to group AI bots warmly and search bots coolly.
const BOT_COLORS: Record<string, string> = {
  // OpenAI — green/teal family
  "GPTBot": "#15803d",
  "ChatGPT-User": "#16a34a",
  "OAI-SearchBot": "#5eead4",
  // Anthropic — amber/gold
  "ClaudeBot": "#d97706",
  "Claude-User": "#f59e0b",
  "Claude-SearchBot": "#fcd34d",
  // Perplexity — purple
  "PerplexityBot": "#7c3aed",
  "Perplexity-User": "#a78bfa",
  // Google — blue
  "Googlebot": "#1d4ed8",
  "Google-Extended": "#60a5fa",
  // Bing — cyan
  "bingbot": "#0891b2",
  // Yandex — red
  "YandexBot": "#dc2626",
  "YandexAdditionalBot": "#f87171",
  // Others
  "DeepSeekBot": "#475569",
  "Bytespider": "#ea580c",
  "CCBot": "#334155",
};

function getBotColor(name: string, fallbackIndex = 0) {
  return BOT_COLORS[name] || CHART_COLORS[fallbackIndex % CHART_COLORS.length];
}

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
          <div className="text-lg font-semibold tabular-nums tracking-tight" data-testid={`kpi-${label}`}>
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
          <span className="font-medium tabular-nums">{Number(p.value).toLocaleString("ru-RU")}</span>
        </div>
      ))}
    </div>
  );
}

// Tooltip for the stacked daily bot chart — sorts bots by count desc,
// hides zero entries, shows total at bottom.
function DailyBotsTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const rows = payload
    .filter((p: any) => p.value > 0)
    .sort((a: any, b: any) => b.value - a.value);
  const total = rows.reduce((s: number, r: any) => s + (r.value || 0), 0);
  return (
    <div className="bg-popover border rounded-md px-3 py-2 shadow-lg text-xs min-w-[200px]">
      <div className="font-semibold mb-1.5 tabular-nums">{label}</div>
      <div className="space-y-1">
        {rows.map((p: any, i: number) => (
          <div key={i} className="flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ background: p.color }}
              />
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
          <span className="font-semibold tabular-nums">
            {total.toLocaleString("ru-RU")}
          </span>
        </div>
      )}
    </div>
  );
}

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

  const { session, summary, statusCodes, botCrawl, topUrls, hourly, statusByBot, userAgents, dailyBots, trackedBotsPresent } = data;

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

  // Prepare daily bot chart data: flatten { date, counts } into { date, [bot]: n, ... }
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
        {/* KPI Row */}
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
          <TabsList data-testid="tabs-navigation">
            <TabsTrigger value="crawl" data-testid="tab-crawl">
              <Bot className="w-3.5 h-3.5 mr-1.5" />Краулинг
            </TabsTrigger>
            <TabsTrigger value="status" data-testid="tab-status">
              <Activity className="w-3.5 h-3.5 mr-1.5" />Коды ответов
            </TabsTrigger>
            <TabsTrigger value="agents" data-testid="tab-agents">
              <Search className="w-3.5 h-3.5 mr-1.5" />User-Agents
            </TabsTrigger>
            <TabsTrigger value="urls" data-testid="tab-urls">
              <Globe className="w-3.5 h-3.5 mr-1.5" />Топ URL
            </TabsTrigger>
          </TabsList>

          {/* Crawl Budget Tab */}
          <TabsContent value="crawl" className="space-y-4">
            {/* Daily bot visits — stacked bars */}
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
                        <div className="font-semibold tabular-nums text-sm" data-testid="kpi-daily-total">
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
                          <div
                            className="font-semibold text-sm"
                            style={{ color: getBotColor(topBot[0]) }}
                            data-testid="kpi-top-bot"
                          >
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
                    <BarChart
                      data={dailyChartData}
                      margin={{ left: 0, right: 10, top: 5, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11 }}
                        stroke="hsl(var(--muted-foreground))"
                        interval="preserveStartEnd"
                        minTickGap={40}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        stroke="hsl(var(--muted-foreground))"
                        allowDecimals={false}
                        width={50}
                      />
                      <Tooltip
                        content={<DailyBotsTooltip />}
                        cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                        iconType="square"
                        iconSize={10}
                      />
                      {(trackedBotsPresent || []).map((bot, i) => (
                        <Bar
                          key={bot}
                          dataKey={bot}
                          name={bot}
                          stackId="bots"
                          fill={getBotColor(bot, i)}
                          maxBarSize={40}
                        />
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
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Активность ботов</CardTitle>
                </CardHeader>
                <CardContent>
                  {botCrawl.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={botCrawl.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                        <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis type="category" dataKey="botName" width={120} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
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

          {/* Status Codes Tab */}
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
                        <Pie
                          data={statusGroupData}
                          cx="50%" cy="50%"
                          innerRadius={50} outerRadius={85}
                          dataKey="value" nameKey="name"
                          strokeWidth={2} stroke="hsl(var(--card))"
                        >
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
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Детальные коды</CardTitle>
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

          {/* User Agents Tab */}
          <TabsContent value="agents" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Топ User-Agent (до 50)</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[480px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs w-[40%]">User-Agent</TableHead>
                        <TableHead className="text-xs">Тип</TableHead>
                        <TableHead className="text-xs text-right">Запросы</TableHead>
                        <TableHead className="text-xs text-right">Доля</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(userAgents || []).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="align-top py-2">
                            <div
                              className="text-xs font-mono text-foreground max-w-[460px] truncate"
                              title={row.userAgent}
                              data-testid={`text-useragent-${i}`}
                            >
                              {row.userAgent || "(пусто)"}
                            </div>
                          </TableCell>
                          <TableCell>
                            {row.isBot ? (
                              <Badge variant="outline" className="text-xs">
                                <Bot className="w-3 h-3 mr-1" />{row.botName || "Бот"}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">Пользователь</span>
                            )}
                          </TableCell>
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
          </TabsContent>

          {/* Top URLs Tab */}
          <TabsContent value="urls" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Топ-30 URL по количеству запросов</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[480px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs w-[55%]">URL</TableHead>
                        <TableHead className="text-xs text-right">Запросы</TableHead>
                        <TableHead className="text-xs text-right">Ср. код</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(topUrls || []).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs font-mono max-w-[400px] truncate" title={row.url}>
                            {row.url}
                          </TableCell>
                          <TableCell className="text-xs text-right tabular-nums">
                            {row.count.toLocaleString("ru-RU")}
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

        <PerplexityAttribution />
      </div>
    </div>
  );
}
