import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-4xl font-bold text-foreground">404</h1>
        <h2 className="mt-2 text-lg font-semibold text-foreground">화면을 찾을 수 없습니다</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          요청하신 세션이 종료되었거나 잘못된 경로입니다.
        </p>
        <div className="mt-4">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-destructive">
          화면을 로드하는 중 오류가 발생했습니다
        </h1>
        <p className="mt-2 text-xs text-muted-foreground">{error?.message}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            다시 시도
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
          >
            홈으로
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Proposal Workbench — HitL Viewer" },
      { name: "description", content: "Agent Human-in-the-loop Viewer" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-primary/20">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen flex-col bg-background">
        {/* 미니멀 탑 네비게이션 바 (사이드바 완전 제거) */}
        <header className="sticky top-0 z-50 flex h-12 items-center justify-between border-b bg-card/80 px-5 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2 font-semibold text-sm tracking-tight text-foreground">
              <span className="flex size-5 items-center justify-center rounded bg-primary text-[10px] text-primary-foreground font-bold">
                P
              </span>
              Proposal Workbench
            </Link>
            <span className="text-[11px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground font-mono">
              HitL Viewer
            </span>
          </div>

          <nav className="flex items-center gap-1 text-xs">
            <Link
              to="/search"
              className="rounded px-2.5 py-1 text-muted-foreground transition-colors hover:text-foreground hover:bg-accent [&.active]:bg-accent [&.active]:text-foreground [&.active]:font-medium"
            >
              레퍼런스 피커
            </Link>
            <Link
              to="/planning"
              className="rounded px-2.5 py-1 text-muted-foreground transition-colors hover:text-foreground hover:bg-accent [&.active]:bg-accent [&.active]:text-foreground [&.active]:font-medium"
            >
              청사진 검토
            </Link>
            <Link
              to="/ingest"
              className="rounded px-2.5 py-1 text-muted-foreground transition-colors hover:text-foreground hover:bg-accent [&.active]:bg-accent [&.active]:text-foreground [&.active]:font-medium"
            >
              PPT 인제스트
            </Link>
          </nav>
        </header>

        {/* 본문 뷰어 */}
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </QueryClientProvider>
  );
}
