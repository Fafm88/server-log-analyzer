import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Upload, FileText, Trash2, BarChart3, Server,
} from "lucide-react";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

export default function HomePage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: sessions, isLoading } = useQuery<any[]>({
    queryKey: ["/api/sessions"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/sessions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
    },
  });

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 h-14 max-w-[1400px] mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="SEO Log Analyzer">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                <path d="M14 2v6h6" />
                <path d="M8 13h2" />
                <path d="M8 17h6" />
                <path d="M8 9h1" />
              </svg>
            </div>
            <span className="font-semibold text-sm tracking-tight">SEO Log Analyzer</span>
          </div>
          <Button size="sm" onClick={() => setLocation("/upload")} data-testid="button-upload">
            <Upload className="w-3.5 h-3.5 mr-1.5" />
            Загрузить лог
          </Button>
        </div>
      </div>

      <div className="p-6 max-w-[1400px] mx-auto space-y-6">
        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : !sessions || sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
              <Server className="w-7 h-7 text-muted-foreground" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium">Нет загруженных логов</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Загрузите файл access.log вашего сервера для анализа
                краулингового бюджета, кодов ответов и User-Agent.
              </p>
            </div>
            <Button size="sm" onClick={() => setLocation("/upload")} data-testid="button-upload-empty">
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              Загрузить лог
            </Button>
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Файл</TableHead>
                    <TableHead className="text-xs">Сервер</TableHead>
                    <TableHead className="text-xs text-right">Строк</TableHead>
                    <TableHead className="text-xs text-right">Распознано</TableHead>
                    <TableHead className="text-xs">Дата загрузки</TableHead>
                    <TableHead className="text-xs w-[120px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((s: any) => (
                    <TableRow key={s.id} className="cursor-pointer group" onClick={() => setLocation(`/dashboard/${s.id}`)}>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="font-medium truncate max-w-[200px]">{s.filename}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{s.serverType}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">
                        {s.totalLines.toLocaleString("ru-RU")}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">
                        {s.parsedLines.toLocaleString("ru-RU")}
                        <span className="text-muted-foreground ml-1">
                          ({s.totalLines > 0 ? ((s.parsedLines / s.totalLines) * 100).toFixed(0) : 0}%)
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(s.uploadedAt).toLocaleString("ru-RU", {
                          day: "2-digit", month: "2-digit", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7"
                            onClick={(e) => { e.stopPropagation(); setLocation(`/dashboard/${s.id}`); }}
                            data-testid={`button-view-${s.id}`}
                          >
                            <BarChart3 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(s.id); }}
                            data-testid={`button-delete-${s.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <PerplexityAttribution />
      </div>
    </div>
  );
}
