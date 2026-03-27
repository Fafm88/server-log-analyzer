import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, AlertCircle, CheckCircle2 } from "lucide-react";

export default function UploadPage() {
  const [, setLocation] = useLocation();
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("logfile", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Ошибка загрузки" }));
        throw new Error(err.error || "Ошибка загрузки");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      setTimeout(() => setLocation(`/dashboard/${data.sessionId}`), 800);
    },
  });

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      uploadMutation.mutate(file);
    }
  }, [uploadMutation]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      uploadMutation.mutate(file);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] p-6">
      <div className="w-full max-w-xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-page-title">
            Загрузка лог-файла
          </h1>
          <p className="text-sm text-muted-foreground">
            Поддерживаются Nginx и Apache access logs (combined формат)
          </p>
        </div>

        <Card className="border-dashed">
          <CardContent className="p-0">
            <div
              className={`
                relative flex flex-col items-center justify-center gap-4 p-12 rounded-lg cursor-pointer
                transition-colors duration-150
                ${dragActive ? "bg-accent" : "hover:bg-muted/50"}
                ${uploadMutation.isPending ? "pointer-events-none opacity-60" : ""}
              `}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById("file-input")?.click()}
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

              {uploadMutation.isPending ? (
                <div className="flex flex-col items-center gap-3 w-full">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary animate-pulse" />
                  </div>
                  <div className="text-sm font-medium">Обработка файла...</div>
                  <Progress value={66} className="w-full max-w-xs h-1.5" />
                  {selectedFile && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {selectedFile.name} · {formatSize(selectedFile.size)}
                    </span>
                  )}
                </div>
              ) : uploadMutation.isSuccess ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="text-sm font-medium">Файл обработан</div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {uploadMutation.data.parsedLines.toLocaleString("ru-RU")} из {uploadMutation.data.totalLines.toLocaleString("ru-RU")} строк
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
                    <p className="text-xs text-muted-foreground">
                      .log, .txt до 1 ГБ
                    </p>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {uploadMutation.isError && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm" data-testid="text-error">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{uploadMutation.error?.message || "Ошибка при загрузке файла"}</span>
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
