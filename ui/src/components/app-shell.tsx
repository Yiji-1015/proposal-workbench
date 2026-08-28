import { Link, useRouterState } from "@tanstack/react-router";
import {
  FileText,
  FileSearch,
  LayoutGrid,
  Presentation,
  Search,
  PencilRuler,
  Sparkles,
  ClipboardCheck,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "홈", icon: LayoutGrid, group: "" },
  { to: "/convert", label: "문서 변환", icon: FileText, group: "입력 처리" },
  { to: "/rfp", label: "RFP 분석", icon: FileSearch, group: "입력 처리" },
  { to: "/ingest", label: "기존 PPT 등록", icon: Presentation, group: "자료 자산화" },
  { to: "/search", label: "제안서 검색", icon: Search, group: "자료 자산화" },
  { to: "/planning", label: "제안 장표 기획", icon: PencilRuler, group: "제안서 작성" },
  { to: "/generate", label: "PPT 생성", icon: Sparkles, group: "제안서 작성" },
  { to: "/review", label: "PPT 검수", icon: ClipboardCheck, group: "제안서 작성" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  let lastGroup = "";

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 flex w-56 flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
          <div className="flex size-6 items-center justify-center rounded bg-sidebar-primary text-[11px] font-bold text-sidebar-primary-foreground">
            PW
          </div>
          <div className="text-sm font-semibold tracking-tight">제안 워크벤치</div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to;
            const showGroup = item.group && item.group !== lastGroup;
            lastGroup = item.group || lastGroup;
            return (
              <div key={item.to}>
                {showGroup && (
                  <div className="px-2 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
                    {item.group}
                  </div>
                )}
                <Link
                  to={item.to}
                  className={cn(
                    "flex items-center gap-2 rounded px-2 py-1.5 text-[13px] transition-colors",
                    active
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {item.label}
                </Link>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border px-4 py-3 text-[11px] text-sidebar-foreground/55">
          <div className="font-medium text-sidebar-foreground/80">데모 데이터 모드</div>
          모든 결과는 예시 데이터입니다.
        </div>
      </aside>
      <div className="ml-56 flex min-h-screen w-full flex-col">{children}</div>
    </div>
  );
}

export function ToolHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-card/95 px-6 backdrop-blur">
      <div className="min-w-0">
        <h1 className="truncate text-sm font-semibold text-foreground">{title}</h1>
        <p className="truncate text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{actions}</div>
    </header>
  );
}

export function Panel({
  title,
  meta,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("flex flex-col rounded-md border bg-card", className)}>
      {title && (
        <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b px-3">
          <h2 className="text-xs font-semibold text-foreground">{title}</h2>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">{meta}</div>
        </div>
      )}
      <div className={cn("min-h-0 flex-1 p-3", bodyClassName)}>{children}</div>
    </section>
  );
}
