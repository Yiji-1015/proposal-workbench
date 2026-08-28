import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, FileText, Layers } from "lucide-react";
import { useEffect, useState } from "react";

import { SlideThumb } from "@/components/slide-thumb";
import { StatusBadge } from "@/components/status-badge";
import { ingestJobs, slides as defaultMockSlides } from "@/mocks";
import type { Slide } from "@/types";

export const Route = createFileRoute("/ingest")({
  head: () => ({
    meta: [
      { title: "PPT 인제스트 뷰어 — 제안 워크벤치" },
      {
        name: "description",
        content: "과거 제안서 PPTX의 슬라이드 분할 및 색인 결과를 시각적으로 확인합니다.",
      },
    ],
  }),
  component: IngestPage,
});

const BRIDGE_API_BASE = "http://localhost:5174";

function IngestPage() {
  const [pptxStem, setPptxStem] = useState<string | null>(null);
  const [slides, setSlides] = useState<Slide[]>(defaultMockSlides);
  const [manifestInfo, setManifestInfo] = useState<{
    source_pptx?: string;
    total_slides?: number;
    rendered_png_count?: number;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const stem = params.get("pptx") || params.get("stem");
    if (stem) {
      setPptxStem(stem);
      fetch(`${BRIDGE_API_BASE}/api/ingest/${encodeURIComponent(stem)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data && Array.isArray(data.slides)) {
            setManifestInfo({
              source_pptx: data.source_pptx,
              total_slides: data.total_slides,
              rendered_png_count: data.rendered_png_count,
            });
            const mapped: Slide[] = data.slides.map((s: any) => ({
              id: s.slide_id,
              deckName: s.source_pptx,
              slideNumber: s.slide_no,
              title: s.title,
              description: s.image_description,
              tags: s.tags || [],
              status: "done",
              accent: "var(--color-chart-1)",
              layout: (s.layout as any) || "diagram",
            }));
            setSlides(mapped);
          }
        })
        .catch((err) => {
          console.warn("Failed fetching ingest manifest, using fallback:", err);
        });
    }
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Layers className="size-5 text-primary" />
            PPT 인제스트 뷰어
            {manifestInfo?.source_pptx && (
              <span className="text-xs font-normal text-muted-foreground font-mono">
                ({manifestInfo.source_pptx})
              </span>
            )}
          </h1>
          <p className="text-xs text-muted-foreground">
            {manifestInfo
              ? `총 ${manifestInfo.total_slides}개 슬라이드 분할 및 ${manifestInfo.rendered_png_count}개 PNG 고화질 렌더링 완료`
              : "과거 제안서 PPTX 분할 및 색인 상태 확인"}
          </p>
        </div>

        {pptxStem && (
          <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>색인 완료됨</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        {slides.map((s) => (
          <div key={s.id} className="rounded-lg border bg-card p-3 transition-shadow hover:shadow-sm">
            <SlideThumb title={s.title} accent={s.accent} layout={s.layout} />
            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="tabular-nums font-medium">Slide {s.slideNumber}</span>
              <StatusBadge status={s.status} />
            </div>
            <div className="mt-1 text-xs font-semibold leading-snug text-foreground">
              {s.title}
            </div>
            <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground leading-relaxed">
              {s.description}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {s.tags.map((t) => (
                <span
                  key={t}
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  #{t}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
