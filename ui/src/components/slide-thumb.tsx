import { cn } from "@/lib/utils";

type Layout = "title" | "bullets" | "chart" | "diagram" | "table";

/** mock 슬라이드 썸네일 (실제 렌더링 없이 구조만 표현) */
export function SlideThumb({
  title,
  accent = "var(--color-chart-1)",
  layout = "bullets",
  className,
  compact,
}: {
  title: string;
  accent?: string;
  layout?: Layout;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-sm border bg-card",
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accent }} />
      <div className="flex h-full flex-col gap-2 p-3">
        <div
          className={cn(
            "line-clamp-2 font-semibold leading-tight text-foreground",
            compact ? "text-[9px]" : "text-xs",
          )}
        >
          {title}
        </div>
        <div className="flex-1">
          {layout === "bullets" && (
            <div className="space-y-1.5">
              {[100, 86, 72, 92, 60].map((w, i) => (
                <div key={i} className="flex items-center gap-1">
                  <span
                    className="size-1 shrink-0 rounded-full"
                    style={{ backgroundColor: accent }}
                  />
                  <span className="h-1 rounded-full bg-muted" style={{ width: `${w * 0.8}%` }} />
                </div>
              ))}
            </div>
          )}
          {layout === "chart" && (
            <div className="flex h-full items-end gap-1.5 pb-1">
              {[40, 65, 52, 80, 96, 72].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-[2px]"
                  style={{ height: `${h}%`, backgroundColor: accent, opacity: 0.35 + i * 0.1 }}
                />
              ))}
            </div>
          )}
          {layout === "diagram" && (
            <div className="grid h-full grid-cols-4 items-center gap-1">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-2/3 rounded-[2px] border"
                  style={{ borderColor: accent, backgroundColor: `color-mix(in oklab, ${accent} 12%, transparent)` }}
                />
              ))}
            </div>
          )}
          {layout === "table" && (
            <div className="grid h-full grid-cols-3 gap-[2px]">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-[1px] bg-muted"
                  style={i < 3 ? { backgroundColor: accent, opacity: 0.3 } : undefined}
                />
              ))}
            </div>
          )}
          {layout === "title" && (
            <div className="flex h-full items-center">
              <div className="h-2 w-2/3 rounded-full" style={{ backgroundColor: accent, opacity: 0.4 }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
