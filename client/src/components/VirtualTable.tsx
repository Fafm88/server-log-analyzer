import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

export interface VirtualColumn<T> {
  key: string;
  header: ReactNode;
  width: string; // CSS grid width: e.g., "1fr", "120px", "minmax(200px, 1fr)"
  align?: "left" | "right" | "center";
  cell: (row: T, index: number) => ReactNode;
}

interface VirtualTableProps<T> {
  rows: T[];
  columns: VirtualColumn<T>[];
  rowHeight?: number;
  height?: number | string;
  emptyMessage?: string;
  getRowKey?: (row: T, index: number) => string | number;
  testId?: string;
}

export function VirtualTable<T>({
  rows,
  columns,
  rowHeight = 40,
  height = 480,
  emptyMessage = "Нет данных",
  getRowKey,
  testId,
}: VirtualTableProps<T>) {
  const parentRef = useRef<HTMLDivElement | null>(null);

  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  });

  const gridTemplate = columns.map((c) => c.width).join(" ");

  return (
    <div className="border rounded-md bg-card" data-testid={testId}>
      {/* Header */}
      <div
        className="grid items-center gap-3 px-3 py-2 border-b bg-muted/30 text-xs font-medium text-muted-foreground"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {columns.map((c) => (
          <div
            key={c.key}
            className={
              c.align === "right" ? "text-right" :
              c.align === "center" ? "text-center" : "text-left"
            }
          >
            {c.header}
          </div>
        ))}
      </div>

      {/* Body */}
      {rows.length === 0 ? (
        <div className="flex items-center justify-center text-xs text-muted-foreground py-12">
          {emptyMessage}
        </div>
      ) : (
        <div
          ref={parentRef}
          className="overflow-auto"
          style={{ height: typeof height === "number" ? `${height}px` : height }}
        >
          <div
            style={{
              height: `${virt.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virt.getVirtualItems().map((item) => {
              const row = rows[item.index];
              return (
                <div
                  key={getRowKey ? getRowKey(row, item.index) : item.index}
                  className="grid items-center gap-3 px-3 border-b hover:bg-muted/30 transition-colors"
                  style={{
                    gridTemplateColumns: gridTemplate,
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${item.size}px`,
                    transform: `translateY(${item.start}px)`,
                  }}
                >
                  {columns.map((c) => (
                    <div
                      key={c.key}
                      className={`text-xs min-w-0 ${
                        c.align === "right" ? "text-right" :
                        c.align === "center" ? "text-center" : "text-left"
                      }`}
                    >
                      {c.cell(row, item.index)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer count */}
      <div className="px-3 py-1.5 border-t bg-muted/20 text-xs text-muted-foreground tabular-nums">
        {rows.length.toLocaleString("ru-RU")} строк
      </div>
    </div>
  );
}
