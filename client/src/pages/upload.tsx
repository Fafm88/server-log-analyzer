import { useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, AlertCircle, CheckCircle2, X, Info } from "lucide-react";
import { useLogStore } from "@/lib/log-store";
import type { AnalyticsData } from "@/lib/log-store";
import LogWorker from "@/lib/log-worker?worker";

export default function UploadPage() {
  const [, setLocation] = useLocation();
  const { addAnalytics } = useLogStore();
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState<"idle" | "parsing" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<{ parsedLines: number; totalLines: number } | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [linesInfo, setLinesInfo] = useState("");
  const [fileProgress, setFileProgress] = useState("");
  const workerRef = useRef<Worker | null>(null);

  const totalSize = selectedFiles.reduce((s, f) => s + f.size, 0);

  const processFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      setSelectedFiles(files);
      setStatus("parsing");
      setProgress(0);
      setErrorMsg("");
      setLinesInfo("");
      setFileProgress("");

      if (workerRef.current) workerRef.current.terminate();
      const worker = new LogWorker();
      workerRef.current = worker;

      // Session name: single file → its name; multi → "N files" summary
      const sessionName = files.length === 1
        ? files[0].name
        : `${files.length} файлов: ${files[0].name}${files.length > 1 ? `, …` : ""}`;

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
          if (msg.totalFiles > 1) {
            setFileProgress(`Файл ${msg.filesProcessed + 1} из ${msg.totalFiles}: ${msg.currentFile}`);
          } else {
            setFileProgress(msg.currentFile || "");
          }
        } else if (msg.type === "done") {
          const a = msg.analytics;
          const sessionData: AnalyticsData = {
            session: a.sessionMeta,
            summary: a.summary,
            statusCodes: a.statusCodes,
            userAgents: a.userAgents,
            botCrawl: a.botCrawl,
            topUrls: a.topUrls,
            hourly: a.hourly,
            statusByBot: a.statusByBot,
            dailyBots: a.dailyBots || [],
            trackedBotsPresent: a.trackedBotsPresent || [],
            details: a.details || [],
            botErrors: a.botErrors || [],
            detailsTruncated: !!a.detailsTruncated,
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

      worker.postMessage({ files, sessionName });
    },
    [addAnalytics, setLocation],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const files = Array.from(e.dataTransfer.files || []);
      if (files.length > 0) processFiles(files);
    },
    [processFiles],
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) processFiles(files);
  };

  const removeFile = (index: number) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
  };

  const isProcessing = status === "parsing";

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] p-6">
      <div className="w-full max-w-xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-page-title">
            Загрузка лог-файлов
          </h1>
          <p className="text-sm text-muted-foreground">
            Поддерживаются Nginx и Apache access logs (combined формат).
            Файлы до 1 ГБ обрабатываются локально в браузере.
          </p>
        </div>

        <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/40 border text-xs text-muted-foreground">
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
          <div className="space-y-1">
            <div className="font-medium text-foreground">Можно загружать несколько файлов</div>
            <div>
              Например, по одному файлу на каждый день — все данные объединятся в одну сессию анализа.
              Выделите файлы в проводнике или перетащите сразу несколько.
            </div>
          </div>
        </div>

        <Card className="border-dashed">
          <CardContent className="p-0">
            <div
              className={`
                relative flex flex-col items-center justify-center gap-4 p-10 rounded-lg cursor-pointer
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
                multiple
                className="hidden"
                onChange={handleFileSelect}
                data-testid="input-file"
              />

              {isProcessing ? (
                <div className="flex flex-col items-center gap-3 w-full">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary animate-pulse" />
                  </div>
                  <div className="text-sm font-medium">Анализ логов...</div>
                  <Progress value={progress} className="w-full max-w-xs h-1.5" />
                  <div className="text-center space-y-0.5">
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {selectedFiles.length} {selectedFiles.length === 1 ? "файл" : "файлов"} · {formatSize(totalSize)}
                    </div>
                    {fileProgress && (
                      <div className="text-xs text-muted-foreground truncate max-w-xs" title={fileProgress}>
                        {fileProgress}
                      </div>
                    )}
                    {linesInfo && (
                      <div className="text-xs text-muted-foreground tabular-nums">{linesInfo}</div>
                    )}
                  </div>
                </div>
              ) : status === "done" && result ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="text-sm font-medium">Файлы обработаны</div>
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
                      Перетащите файлы сюда или нажмите для выбора
                    </p>
                    <p className="text-xs text-muted-foreground">.log, .txt · несколько файлов</p>
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
