export type JobStatus = "pending" | "processing" | "done" | "failed";

export interface ToolMeta {
  id: string;
  name: string;
  desc: string;
  to: string;
  lastRunAt: string;
  count: number;
}

export interface RecentJob {
  id: string;
  tool: string;
  target: string;
  status: JobStatus;
  updatedAt: string;
}

export interface SourceRef {
  docName: string;
  page: number;
  quote: string;
}

/* 1. 문서 변환 */
export interface ConvertedDoc {
  id: string;
  fileName: string;
  fileType: "HWP" | "HWPX" | "PDF" | "DOCX";
  size: string;
  status: JobStatus;
  progress: number;
  pageCount: number;
  convertedAt: string;
  markdown: string;
  sections: { heading: string; level: number; text: string; page: number }[];
}

/* 2. RFP 분석 */
export interface Requirement {
  id: string;
  category: string;
  text: string;
  priority: "필수" | "권장" | "선택";
  sourceRefs: SourceRef[];
}

export interface RfpAnalysis {
  docName: string;
  analyzedAt: string;
  overview: { label: string; value: string }[];
  workflowSteps: { step: number; title: string; desc: string }[];
  requirements: Requirement[];
  domains: { name: string; desc: string; reqCount: number }[];
  explicitFeatures: { text: string; sourceRefs: SourceRef[] }[];
  hiddenFeatures: { text: string; reason: string }[];
  kpis: { metric: string; target: string; unit: string; sourceRefs: SourceRef[] }[];
  riskAreas: { area: string; reason: string; level: "높음" | "중간" | "낮음" }[];
}

/* 3. PPT 등록 */
export interface IngestJob {
  id: string;
  fileName: string;
  totalSlides: number;
  doneSlides: number;
  status: JobStatus;
  startedAt: string;
}

export interface SlideItem {
  id: string;
  deckName: string;
  slideNumber: number;
  title: string;
  description: string;
  tags: string[];
  status: JobStatus;
  accent: string;
  layout: "title" | "bullets" | "chart" | "diagram" | "table";
}

/* 4. 검색 */
export interface SearchResult extends SlideItem {
  similarity: number;
  year: number;
  projectType: string;
}

/* 5. 장표 기획 */
export interface SlidePlan {
  id: string;
  title: string;
  governingMessage: string;
  blocks: { id: string; type: string; text: string }[];
  metrics: { label: string; value: string; unit: string; sourceRef: string }[];
  sourceRefs: SourceRef[];
  referenceSlideIds: string[];
  status: "draft" | "approved";
}

/* 6. PPT 생성 */
export interface GeneratedSlide {
  slideNumber: number;
  title: string;
  planId: string;
  accent: string;
  layout: SlideItem["layout"];
}

/* 7. 검수 */
export type IssueType = "요구사항 누락" | "정량 수치 변경" | "근거 없는 표현" | "레이아웃 문제";

export interface ReviewIssue {
  id: string;
  type: IssueType;
  severity: "critical" | "warning" | "info";
  slideNumber: number;
  message: string;
  evidence: string;
  suggestion: string;
}
