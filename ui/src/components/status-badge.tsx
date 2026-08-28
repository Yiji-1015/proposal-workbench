import { cn } from "@/lib/utils";
import type { JobStatus } from "@/types";

const map: Record<JobStatus, { label: string; className: string }> = {
  pending: { label: "대기", className: "bg-muted text-muted-foreground border-border" },
  processing: {
    label: "진행중",
    className: "bg-info/10 text-info border-info/30",
  },
  done: { label: "완료", className: "bg-success/10 text-success border-success/30" },
  failed: { label: "실패", className: "bg-destructive/10 text-destructive border-destructive/30" },
};

export function StatusBadge({ status, className }: { status: JobStatus; className?: string }) {
  const s = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium",
        s.className,
        className,
      )}
    >
      {status === "processing" && (
        <span className="size-1.5 animate-pulse rounded-full bg-info" />
      )}
      {s.label}
    </span>
  );
}
