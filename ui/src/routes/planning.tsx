import { createFileRoute } from "@tanstack/react-router";
import { Check, CheckCircle2, GripVertical, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { SlideThumb } from "@/components/slide-thumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { slidePlans, slides } from "@/mocks";
import type { SlidePlan } from "@/types";

export const Route = createFileRoute("/planning")({
  head: () => ({
    meta: [
      { title: "장표 청사진 검토 — 제안 워크벤치" },
      {
        name: "description",
        content: "Agent가 기획한 슬라이드 청사진(거버닝 메시지, 5개 블록, 정량지표)을 검토하고 승인합니다.",
      },
    ],
  }),
  component: PlanningPage,
});

const BRIDGE_API_BASE = "http://localhost:5174";

function PlanningPage() {
  const [plans, setPlans] = useState<SlidePlan[]>(slidePlans);
  const [selectedId, setSelectedId] = useState(plans[0]!.id);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isApproved, setIsApproved] = useState(false);
  const plan = plans.find((p) => p.id === selectedId) || plans[0]!;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("session");
    if (sid) {
      setSessionId(sid);
      fetch(`${BRIDGE_API_BASE}/api/sessions/${encodeURIComponent(sid)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.blueprint) {
            const bp = data.blueprint;
            const mappedPlan: SlidePlan = {
              id: bp.requirement_id || sid,
              title: bp.slide_title || "제안 장표 청사진",
              governingMessage: bp.governing_message || "",
              blocks: (bp.blocks || []).map((b: any, idx: number) => ({
                id: b.block_id || `b-${idx + 1}`,
                type: b.role === "main_process" ? "프로세스" : (b.role === "technology_comparison" ? "비교/선택" : (b.role === "operation_quality" ? "품질/통제" : "핵심전략")),
                text: b.content?.headline || (Array.isArray(b.content?.bullets) ? b.content.bullets.join(", ") : b.role),
              })),
              metrics: (bp.protected_metrics || []).map((m: any) => ({
                label: m.name || m.label || "정량지표",
                value: String(m.parsed_value || m.value_text || ""),
                unit: m.unit || "",
                sourceRef: m.source_refs?.[0]?.section_path || m.source_refs?.[0]?.quote || "RFP 원문",
              })),
              sourceRefs: (bp.source_refs || []).map((r: any) => ({
                docName: r.doc_name || "RFP",
                page: r.page || 1,
                quote: r.quote || "",
              })),
              referenceSlideIds: bp.reference_slide_ids || [],
              status: data.status === "approved" ? "approved" : "draft",
            };
            setPlans([mappedPlan]);
            setSelectedId(mappedPlan.id);
            if (data.status === "approved") setIsApproved(true);
          }
        })
        .catch((err) => {
          console.warn("Session bridge fetch failed for blueprint, using fallback:", err);
        });
    }
  }, []);

  const update = (patch: Partial<SlidePlan>) =>
    setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, ...patch } : p)));

  const handleApprove = async () => {
    if (!sessionId) {
      update({ status: "approved" });
      setIsApproved(true);
      return;
    }
    try {
      await fetch(`${BRIDGE_API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blueprint: {
            requirement_id: plan.id,
            slide_title: plan.title,
            governing_message: plan.governingMessage,
          },
        }),
      });
      update({ status: "approved" });
      setIsApproved(true);
    } catch (err) {
      alert("승인 저장 실패: " + String(err));
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      {/* 상단 액션 헤더 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            {sessionId ? `장표 청사진 검토 및 승인 (${sessionId})` : "장표 청사진 검토"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {sessionId
              ? "Agent가 기획한 슬라이드 청사진입니다. 거버닝 메시지와 5개 블록을 확인/수정 후 승인해 주세요."
              : "고밀도 5개 블록 및 거버닝 메시지 기획안"}
          </p>
        </div>

        <Button
          size="sm"
          disabled={plan.status === "approved" || isApproved}
          onClick={handleApprove}
          className={cn(
            "font-semibold shadow-sm",
            isApproved ? "bg-emerald-600 hover:bg-emerald-600 text-white" : "bg-primary text-primary-foreground"
          )}
        >
          <Check className="mr-1.5 size-4" />
          {plan.status === "approved" || isApproved ? "승인 완료됨" : "기획안 최종 승인"}
        </Button>
      </div>

      {isApproved && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>
            청사진 승인이 완료되었습니다! <strong>Agent 채팅창으로 돌아가 "승인했어"</strong>라고 입력해 주시면 PPT 제작을 시작합니다.
          </span>
        </div>
      )}

      {/* 기획서 본문 카드 */}
      <div className="rounded-xl border bg-card p-5 space-y-5 shadow-sm">
        {/* 1. 슬라이드 제목 */}
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            슬라이드 가시 제목
          </label>
          <Input
            value={plan.title}
            onChange={(e) => update({ title: e.target.value })}
            className="mt-1 h-9 text-xs font-semibold"
          />
        </div>

        {/* 2. 거버닝 메시지 */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Governing Message (핵심 결론 문장)
            </label>
            <span className="text-[10px] text-muted-foreground">
              반드시 <code className="text-primary font-bold">~니다.</code>로 종결
            </span>
          </div>
          <Textarea
            value={plan.governingMessage}
            onChange={(e) => update({ governingMessage: e.target.value })}
            className="mt-1 min-h-16 text-xs leading-relaxed font-medium"
          />
        </div>

        {/* 3. 5개 핵심 독립 블록 */}
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            배치될 5개 핵심 내용 블록
          </label>
          <ul className="mt-1.5 space-y-2">
            {plan.blocks.map((b) => (
              <li key={b.id} className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                <GripVertical className="size-3.5 shrink-0 text-muted-foreground/50" />
                <span className="shrink-0 rounded bg-primary/10 px-2 py-0.5 text-[10.5px] font-semibold text-primary">
                  {b.type}
                </span>
                <span className="flex-1 text-xs text-foreground font-medium">{b.text}</span>
                <button
                  className="text-muted-foreground hover:text-destructive p-1"
                  onClick={() => update({ blocks: plan.blocks.filter((x) => x.id !== b.id) })}
                  title="블록 삭제"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* 4. 보호되는 정량지표 & 원문 근거 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              보호되는 정량지표 (Protected Metrics)
            </label>
            <ul className="mt-1.5 space-y-1.5">
              {plan.metrics.map((m) => (
                <li key={m.label} className="rounded-lg border bg-muted/20 px-3 py-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-muted-foreground">{m.label}</span>
                    <span className="text-xs font-bold text-foreground">
                      {m.value} {m.unit}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">근거: {m.sourceRef}</div>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              RFP 원문 근거 (Source Reference)
            </label>
            <ul className="mt-1.5 space-y-1.5">
              {plan.sourceRefs.map((r, i) => (
                <li key={i} className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">
                  <div className="text-[10px] text-muted-foreground font-medium">
                    {r.docName} (p.{r.page})
                  </div>
                  <p className="text-foreground mt-0.5 line-clamp-2">“{r.quote}”</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
