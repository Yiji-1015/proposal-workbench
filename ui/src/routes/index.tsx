import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FileSearch, Layers, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Proposal Workbench — HitL Viewer" },
      {
        name: "description",
        content: "Agent Human-in-the-loop 보조 뷰어 (레퍼런스 피커, 청사진 검토, PPT 인제스트)",
      },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-12">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Proposal Workbench <span className="text-primary font-normal">HitL Viewer</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Agent가 작업을 수행하는 도중 사람의 시각적 판단이 필요한 순간에 자동으로 열리는 뷰어입니다.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 pt-6">
        <Link
          to="/search"
          className="group relative rounded-xl border bg-card p-5 transition-all hover:border-primary/50 hover:shadow-sm"
        >
          <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileSearch className="size-5" />
          </div>
          <div className="flex items-center justify-between font-semibold text-foreground">
            <span>레퍼런스 피커</span>
            <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            자연어 검색으로 찾은 과거 우수 제안 장표들을 시각적으로 비교하고 선택합니다.
          </p>
        </Link>

        <Link
          to="/planning"
          className="group relative rounded-xl border bg-card p-5 transition-all hover:border-primary/50 hover:shadow-sm"
        >
          <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="size-5" />
          </div>
          <div className="flex items-center justify-between font-semibold text-foreground">
            <span>장표 청사진 검토</span>
            <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Agent가 기획한 5개 블록 구조와 거버닝 메시지를 검토하고 수정하여 최종 승인합니다.
          </p>
        </Link>

        <Link
          to="/ingest"
          className="group relative rounded-xl border bg-card p-5 transition-all hover:border-primary/50 hover:shadow-sm"
        >
          <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Layers className="size-5" />
          </div>
          <div className="flex items-center justify-between font-semibold text-foreground">
            <span>PPT 인제스트</span>
            <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            과거 제안서 PPTX를 슬라이드별로 분할하고 색인 상태를 시각적으로 확인합니다.
          </p>
        </Link>
      </div>

      <div className="rounded-lg border bg-muted/40 p-4 text-center text-xs text-muted-foreground">
        💡 평소에는 이 브라우저를 띄워두지 않아도 됩니다. Agent가 제안 작업 중 필요할 때 해당 화면을 자동으로 엽니다.
      </div>
    </div>
  );
}
