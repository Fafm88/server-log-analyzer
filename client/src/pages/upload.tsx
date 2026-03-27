import { useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import { useLogStore } from "@/lib/log-store";
import type { AnalyticsData } from "@/lib/log-store";
import LogWorker from "@/lib/log-worker?worker";

export default function UploadPage() {
  const [, setLocation] = useLocation();
  const { addAnalytics } = useLogStore();
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState<"idle" | "reading" | "parsing" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<{ parsedLines: number; totalLines: number } | null>(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedFileSize, setSelectedFileSize] = useState(0);
  const [linesInfo, setLinesInfo] = useState("");
  const workerRef = useRef<Worker | null>(null);

  const processFile = useCallback(
    (file: File) => {
      setSelectedFileName(file.name);
      setSelectedFileSize(file.size);
      setStatus("parsing");
      setProgress(0);
      setErrorMsg("");
      setLinesInfo("");

      // Terminate previous worker if any
      if (workerRef.current) {
        workerRef.current.terminate();
      }

      const worker = new LogWorker();
      workerRef.current = worker;

      worker.onmessage = (e: MessageEvent) => {
        const msg = e.data;

        if (msg.type === "progress") {
          const pct = msg.totalBytes > 0
            ? Math.round((msg.bytesRead / msg.totalBytes) * 90)
            : 0;
          setProgress(Math.min(pct, 90));
          setLinesInfo(
            `${formatNumber(msg.linesProcessed)} строк обработано, ${formatNumber(msg.linesParsed)} распознано`
          );
        } else if (msg.type === "done") {
          const analytics = msg.analytics;
          const sessionData: AnalyticsData = {
            session: analytics.sessionMeta,
            summary: analytics.summary,
            statusCodes: analytics.statusCodes,
            userAgents: analytics.userAgents,
            botCrawl: analytics.botCrawl,
            topUrls: analytics.topUrls,
            hourly: analytics.hourly,
            statusByBot: analytics.statusByBot,
          };

          if (sessionData.session.parsedLines === 0) {
            setStatus("error");
            setErrorMsg(
              "Не удалось распознать ни одной строки. Убедитесь, что файл в формате Nginx/Apache combined log."
            );
            worker.terminate();
            return;
          }

          setProgress(100);
          addAnalytics(sessionData);
          setResult({
            parsedLines: sessionData.session.parsedLines,
            totalLines: sessionData.session.totalLines,
          });
          setStatus("done");
          worker.terminate();

          setTimeout(() => setLocation(`/dashboard/${sessionData.session.id}`), 800);
        } else if (msg.type === "error") {
          setStatus("error");
          setErrorMsg(msg.message || "Ошибка при обработке файла");
          worker.terminate();
        }
      };

      worker.onerror = (err) => {
        setStatus("error");
        setErrorMsg(err.message || "Ошибка Web Worker");
        worker.terminate();
      };

      // Send file to worker (transferable — zero-copy)
      worker.postMessage({ file, filename: file.name });
    },
    [addAnalytics, setLocation],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const isProcessing = status === "reading" || status === "parsing";

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] p-6">
      <div className="w-full max-w-xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-page-title">
            Загрузка лог-файла
          </h1>
          <p className="text-sm text-muted-foreground">
            Поддерживаются Nginx и Apache access logs (combined формат).
            Файлы до 1 ГБ обрабатываются локально в браузере.
          </p>
        </div>

        <Card className="border-dashed">
          <CardContent className="p-0">
            <div
              className={`
                relative flex flex-col items-center justify-center gap-4 p-12 rounded-lg cursor-pointer
                transition-colors duration-150
                ${dragActive ? "bg-accent" : "hover:bg-muted/50"}
                ${isProcessing ? "pointer-events-none opacity-60" : ""}
              `}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => !isProcessing && document.getElementById("file-input")?.click()}
              data-testid="dropzone"
            >
              <input
                id="file-input"
                type="file"
                accept=".log,.txt,.gz"
                className="hidden"
                onChange={handleFileSelect}
                data-testid="input-file"
              />

              {isProcessing ? (
                <div className="flex flex-col items-center gap-3 w-full">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary animate-pulse" />
                  </div>
                  <div className="text-sm font-medium">
                    Анализ логов...
                  </div>
                  <Progress value={progress} className="w-full max-w-xs h-1.5" />
                  <div className="text-center">
                    {selectedFileName && (
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {selectedFileName} · {formatSize(selectedFileSize)}
                      </div>
                    )}
                    {linesInfo && (
                      <div className="text-xs text-muted-foreground tabular-nums mt-1">
                        {linesInfo}
                      </div>
                    )}
                  </div>
                </div>
              ) : status === "done" && result ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="text-sm font-medium">Файл обработан</div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {formatNumber(result.parsedLines)} из {formatNumber(result.totalLines)} строк
                  </div>
                </div>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                    <Upload className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-sm font-medium">
                      Перетащите файл сюда или нажмите для выбора
                    </p>
                    <p className="text-xs text-muted-foreground">.log, .txt — до 1 ГБ</p>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {status === "error" && errorMsg && (
          <div
            className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm"
            data-testid="text-error"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="text-center">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => setLocation("/")}
            data-testid="link-back"
          >
            Назад к сессиям
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
}

function formatNumber(n: number) {
  return n.toLocaleString("ru-RU");
}
