import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

// Lightweight session metadata — no entries stored
export interface SessionMeta {
  id: string;
  filename: string;
  serverType: string;
  totalLines: number;
  parsedLines: number;
  uploadedAt: string;
}

export interface AnalyticsData {
  session: SessionMeta;
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
  dailyBots: { date: string; counts: Record<string, number>; total: number }[];
  trackedBotsPresent: string[];
}

interface LogStore {
  sessions: SessionMeta[];
  addAnalytics: (data: AnalyticsData) => void;
  deleteSession: (id: string) => void;
  getAnalytics: (id: string) => AnalyticsData | null;
}

const LogStoreContext = createContext<LogStore | null>(null);

export function LogStoreProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [analyticsCache, setAnalyticsCache] = useState<Map<string, AnalyticsData>>(new Map());

  const addAnalytics = useCallback((data: AnalyticsData) => {
    setSessions((prev) => [data.session, ...prev]);
    setAnalyticsCache((prev) => {
      const next = new Map(prev);
      next.set(data.session.id, data);
      return next;
    });
  }, []);

  const deleteSession = useCallback((id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    setAnalyticsCache((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const getAnalytics = useCallback(
    (id: string): AnalyticsData | null => {
      return analyticsCache.get(id) || null;
    },
    [analyticsCache],
  );

  return (
    <LogStoreContext.Provider value={{ sessions, addAnalytics, deleteSession, getAnalytics }}>
      {children}
    </LogStoreContext.Provider>
  );
}

export function useLogStore() {
  const ctx = useContext(LogStoreContext);
  if (!ctx) throw new Error("useLogStore must be used within LogStoreProvider");
  return ctx;
}
