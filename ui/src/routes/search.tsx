import { createFileRoute } from "@tanstack/react-router";
import { Check, CheckCircle2, FileSearch, Search as SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { SlideThumb } from "@/components/slide-thumb";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { searchResults as defaultMockResults } from "@/mocks";
import type { SearchResult } from "@/types";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "레퍼런스 피커 — 제안 워크벤치" },
      {
        name: "description",
        content: "자연어로 검색된 과거 제안 장표를 시각적으로 비교하고 선택합니다.",
      },
    ],
  }),
  component: SearchPage,
});

const years = [2026, 2025, 2024];
const BRIDGE_API_BASE = "http://localhost:5174";

function SearchPage() {
  const [query, setQuery] = useState("실시간 관제 아키텍처와 성능 확보 방안");
  const [year, setYear] = useState<number | null>(null);
  const [preview, setPreview] = useState<SearchResult | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<SearchResult[]>(defaultMockResults);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("session");
    if (sid) {
      setSessionId(sid);
      fetch(`${BRIDGE_API_BASE}/api/sessions/${encodeURIComponent(sid)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data && Array.isArray(data.candidates)) {
            const mapped: SearchResult[] = data.candidates.map((c: any) => ({
              id: c.slide_id,
              deckName: c.source_pptx,
              slideNumber: c.slide_no,
              title: c.title,
              description: c.image_description,
              tags: c.tags || [],
              status: "done",
              accent: "var(--color-chart-1)",
              layout: (c.layout as any) || "diagram",
              similarity: c.similarity || 0.85,
              year: c.year || 2026,
              projectType: c.project_type || "관제",
            }));
            setCandidates(mapped);
            if (data.query) setQuery(data.query);
            if (Array.isArray(data.selected_slide_ids)) {
              setSelectedIds(data.selected_slide_ids);
            }
          }
        })
        .catch((err) => {
          console.warn("Session bridge fetch failed, using fallback:", err);
        });
    }
  }, []);

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleCompleteSelection = async () => {
    if (!sessionId) {
      alert("선택된 슬라이드: " + selectedIds.join(", "));
      return;
    }
    try {
      await fetch(`${BRIDGE_API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected_slide_ids: selectedIds }),
      });
      setIsCompleted(true);
    } catch (err) {
      alert("선택 저장 실패: " + String(err));
    }
  };

  const results = useMemo(
    () =>
      candidates
        .filter((r) => (year ? r.year === year : true))
        .sort((x, y) => y.similarity - x.similarity),
    [candidates, year],
  );

  const idx = preview ? results.findIndex((r) => r.id === preview.id) : -1;
  const move = (d: number) => {
    const next = results[idx + d];
    if (next) setPreview(next);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      {/* 상단 액션 헤더 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <FileSearch className="size-5 text-primary" />
            {sessionId ? `레퍼런스 장표 선택 (${sessionId})` : "제안 장표 레퍼런스 검색"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {sessionId
              ? "Agent가 추천한 후보 장표입니다. 슬라이드를 비교하고 참고할 장표를 선택해 주세요."
              : "과거 우수 제안 장표 자연어 검색"}
          </p>
        </div>

        {selectedIds.length > 0 && !isCompleted && (
          <Button
            size="sm"
            onClick={handleCompleteSelection}
            className="bg-primary text-primary-foreground font-semibold shadow-sm"
          >
            <Check className="mr-1.5 size-4" />
            선택한 {selectedIds.length}개 장표 확정
          </Button>
        )}
      </div>

      {isCompleted && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>
            선택이 확정되었습니다! <strong>Agent 채팅창으로 돌아가 "골랐어"</strong>라고 입력해 주시면 다음 작업을 이어갑니다.
          </span>
        </div>
      )}

      {/* 검색 필터 바 */}
      <div className="flex items-center justify-between rounded-lg border bg-card p-3">
        <div className="flex items-center gap-2 flex-1 max-w-lg">
          <SearchIcon className="size-4 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">“{query}”</span>
          <span className="text-[11px] text-muted-foreground">({results.length}건 검색됨)</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground mr-1">연도:</span>
          {years.map((y) => (
            <button
              key={y}
              onClick={() => setYear(year === y ? null : y)}
              className={cn(
                "rounded px-2 py-0.5 text-[11px] border transition-colors",
                year === y ? "bg-primary text-primary-foreground border-primary font-medium" : "text-muted-foreground hover:bg-muted"
              )}
            >
              {y}년
            </button>
          ))}
        </div>
      </div>

      {/* 후보 슬라이드 갤러리 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        {results.map((r) => {
          const isSelected = selectedIds.includes(r.id);
          return (
            <div
              key={r.id}
              onClick={() => setPreview(r)}
              className={cn(
                "relative rounded-xl border bg-card p-3 text-left transition-all cursor-pointer hover:border-primary/60 hover:shadow-sm",
                isSelected && "ring-2 ring-primary border-primary bg-primary/5",
              )}
            >
              {/* 선택 체크 버튼 */}
              <div
                className={cn(
                  "absolute right-3 top-3 z-10 flex size-6 items-center justify-center rounded-full border shadow-sm transition-all",
                  isSelected ? "bg-primary text-primary-foreground border-primary" : "bg-background/90 text-muted-foreground hover:bg-muted"
                )}
                onClick={(e) => toggleSelect(r.id, e)}
                title={isSelected ? "선택 해제" : "참고자료로 선택"}
              >
                {isSelected ? <Check className="size-3.5" /> : <div className="size-2 rounded-full bg-muted-foreground/40" />}
              </div>

              <SlideThumb title={r.title} accent={r.accent} layout={r.layout} />

              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  Slide {r.slideNumber}
                </span>
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
                  유사도 {(r.similarity * 100).toFixed(0)}%
                </span>
              </div>
              <div className="mt-1 text-xs font-semibold leading-snug text-foreground">
                {r.title}
              </div>
              <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{r.deckName}</div>
              <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground leading-relaxed">
                {r.description}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {r.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* 미리보기 모달 */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">{preview?.title}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="grid grid-cols-[1fr_260px] gap-4">
              <SlideThumb
                title={preview.title}
                accent={preview.accent}
                layout={preview.layout}
                className="w-full"
              />
              <div className="space-y-3 text-xs">
                <div>
                  <div className="text-[10px] text-muted-foreground">원본 파일 / 슬라이드</div>
                  <div className="font-medium text-foreground">{preview.deckName} (p.{preview.slideNumber})</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">유사도</div>
                  <div className="font-semibold text-primary">{(preview.similarity * 100).toFixed(0)}%</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">설명</div>
                  <p className="leading-relaxed text-foreground text-[11px]">{preview.description}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {preview.tags.map((t) => (
                    <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                      #{t}
                    </span>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant={selectedIds.includes(preview.id) ? "outline" : "default"}
                  className="w-full text-xs"
                  onClick={() => toggleSelect(preview.id)}
                >
                  {selectedIds.includes(preview.id) ? "선택 해제" : "참고 장표로 선택"}
                </Button>
              </div>
              <div className="col-span-2 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                <Button size="sm" variant="outline" disabled={idx <= 0} onClick={() => move(-1)}>
                  이전
                </Button>
                <span>{idx + 1} / {results.length}</span>
                <Button size="sm" variant="outline" disabled={idx >= results.length - 1} onClick={() => move(1)}>
                  다음
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
