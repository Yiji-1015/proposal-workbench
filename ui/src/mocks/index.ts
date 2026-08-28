import type {
  ConvertedDoc,
  GeneratedSlide,
  IngestJob,
  RecentJob,
  ReviewIssue,
  RfpAnalysis,
  SearchResult,
  SlideItem,
  SlidePlan,
  ToolMeta,
} from "@/types";

export const tools: ToolMeta[] = [
  {
    id: "convert",
    name: "문서 변환",
    desc: "HWP·PDF·DOCX 문서를 Markdown / 구조화 텍스트로 변환",
    to: "/convert",
    lastRunAt: "오늘 09:41",
    count: 128,
  },
  {
    id: "rfp",
    name: "RFP 분석",
    desc: "사업 개요·요구사항·KPI·리스크 영역을 근거와 함께 정리",
    to: "/rfp",
    lastRunAt: "오늘 08:12",
    count: 34,
  },
  {
    id: "ingest",
    name: "기존 PPT 등록",
    desc: "과거 제안서를 슬라이드 단위로 분석해 검색 DB에 등록",
    to: "/ingest",
    lastRunAt: "어제 18:05",
    count: 62,
  },
  {
    id: "search",
    name: "제안서 검색",
    desc: "자연어로 과거 제안 장표를 찾고 미리보기",
    to: "/search",
    lastRunAt: "오늘 10:22",
    count: 411,
  },
  {
    id: "planning",
    name: "제안 장표 기획",
    desc: "요구사항 기반으로 장표 구성안을 작성하고 승인",
    to: "/planning",
    lastRunAt: "오늘 10:03",
    count: 57,
  },
  {
    id: "generate",
    name: "PPT 생성",
    desc: "승인된 기획안을 PPTX로 생성하고 내려받기",
    to: "/generate",
    lastRunAt: "어제 16:44",
    count: 19,
  },
  {
    id: "review",
    name: "PPT 검수",
    desc: "요구사항 누락·수치 오류·근거 없는 표현 점검",
    to: "/review",
    lastRunAt: "어제 15:30",
    count: 26,
  },
];

export const recentJobs: RecentJob[] = [
  {
    id: "j-1",
    tool: "RFP 분석",
    target: "2026_스마트물류_통합관제_RFP.hwp",
    status: "done",
    updatedAt: "오늘 08:12",
  },
  {
    id: "j-2",
    tool: "문서 변환",
    target: "과업지시서_최종본.pdf",
    status: "processing",
    updatedAt: "오늘 09:41",
  },
  {
    id: "j-3",
    tool: "제안 장표 기획",
    target: "통합관제 아키텍처 장표",
    status: "done",
    updatedAt: "오늘 10:03",
  },
  {
    id: "j-4",
    tool: "기존 PPT 등록",
    target: "2025_공항공사_제안서_v3.pptx",
    status: "done",
    updatedAt: "어제 18:05",
  },
  {
    id: "j-5",
    tool: "PPT 검수",
    target: "물류관제_제안서_초안.pptx",
    status: "failed",
    updatedAt: "어제 15:30",
  },
];

export const convertedDocs: ConvertedDoc[] = [
  {
    id: "d-1",
    fileName: "2026_스마트물류_통합관제_RFP.hwp",
    fileType: "HWP",
    size: "4.2 MB",
    status: "done",
    progress: 100,
    pageCount: 86,
    convertedAt: "오늘 09:12",
    markdown: `# 스마트물류 통합관제 플랫폼 구축 사업

## 1. 사업 개요
- 사업명: 스마트물류 통합관제 플랫폼 구축
- 발주기관: 한국물류공사
- 사업기간: 계약일로부터 10개월
- 사업예산: 금 2,400,000,000원 (부가세 포함)

## 2. 추진 배경 및 필요성
현행 관제 시스템은 거점별로 분산 운영되어 실시간 통합 모니터링이 불가하며,
데이터 표준이 상이하여 통계 산출에 평균 3일이 소요된다.

## 3. 목표 시스템 요구사항
### 3.1 통합관제 대시보드
- 전국 12개 물류 거점의 실시간 상태를 단일 화면에서 조회
- 이상 상황 발생 시 5초 이내 알림

### 3.2 데이터 연계
- 기존 WMS/TMS 3종과 표준 API 연계
- 일 500만 건 이상 데이터 처리`,
    sections: [
      { heading: "사업 개요", level: 1, text: "스마트물류 통합관제 플랫폼 구축", page: 3 },
      { heading: "추진 배경 및 필요성", level: 1, text: "거점별 분산 운영 문제", page: 5 },
      { heading: "목표 시스템 요구사항", level: 1, text: "통합관제·데이터 연계 요구", page: 12 },
      { heading: "통합관제 대시보드", level: 2, text: "12개 거점 실시간 조회", page: 13 },
      { heading: "데이터 연계", level: 2, text: "WMS/TMS 3종 표준 API", page: 18 },
      { heading: "제안 평가 기준", level: 1, text: "기술 80 / 가격 20", page: 71 },
    ],
  },
  {
    id: "d-2",
    fileName: "과업지시서_최종본.pdf",
    fileType: "PDF",
    size: "1.8 MB",
    status: "processing",
    progress: 62,
    pageCount: 42,
    convertedAt: "-",
    markdown: "",
    sections: [],
  },
  {
    id: "d-3",
    fileName: "사전규격_공고문.docx",
    fileType: "DOCX",
    size: "620 KB",
    status: "done",
    progress: 100,
    pageCount: 12,
    convertedAt: "어제 17:20",
    markdown: `# 사전규격 공고문

## 공고 개요
- 공고번호: 2026-KLC-0142
- 접수마감: 2026-09-15 18:00

## 주요 요구사항 요약
- 클라우드 기반 구축 (민간 클라우드 허용)
- 개인정보 비식별 처리 필수`,
    sections: [
      { heading: "공고 개요", level: 1, text: "공고번호 2026-KLC-0142", page: 1 },
      { heading: "주요 요구사항 요약", level: 1, text: "클라우드 기반 구축", page: 4 },
    ],
  },
  {
    id: "d-4",
    fileName: "붙임3_요구사항정의서.hwpx",
    fileType: "HWPX",
    size: "2.4 MB",
    status: "failed",
    progress: 0,
    pageCount: 0,
    convertedAt: "-",
    markdown: "",
    sections: [],
  },
];

const ref = (page: number, quote: string) => ({
  docName: "2026_스마트물류_통합관제_RFP.hwp",
  page,
  quote,
});

export const rfpAnalysis: RfpAnalysis = {
  docName: "2026_스마트물류_통합관제_RFP.hwp",
  analyzedAt: "오늘 08:12",
  overview: [
    { label: "사업명", value: "스마트물류 통합관제 플랫폼 구축" },
    { label: "발주기관", value: "한국물류공사" },
    { label: "사업기간", value: "계약일로부터 10개월" },
    { label: "사업예산", value: "2,400백만원 (VAT 포함)" },
    { label: "평가방식", value: "기술 80 : 가격 20" },
    { label: "제안마감", value: "2026-09-15 18:00" },
  ],
  workflowSteps: [
    { step: 1, title: "현황 수집", desc: "12개 거점 WMS/TMS 데이터 수집 및 표준화" },
    { step: 2, title: "통합 적재", desc: "표준 스키마로 통합 데이터 레이크 적재" },
    { step: 3, title: "실시간 관제", desc: "단일 대시보드에서 거점 상태 모니터링" },
    { step: 4, title: "이상 대응", desc: "임계치 초과 시 5초 이내 알림 및 조치 이력 관리" },
    { step: 5, title: "성과 분석", desc: "일·월 단위 KPI 리포트 자동 산출" },
  ],
  requirements: [
    {
      id: "SFR-001",
      category: "기능",
      text: "전국 12개 물류 거점의 실시간 상태를 단일 화면에서 조회할 수 있어야 한다.",
      priority: "필수",
      sourceRefs: [ref(13, "전국 12개 물류 거점의 실시간 상태를 단일 화면에서 조회")],
    },
    {
      id: "SFR-002",
      category: "기능",
      text: "이상 상황 발생 시 5초 이내에 담당자에게 알림을 발송해야 한다.",
      priority: "필수",
      sourceRefs: [ref(13, "이상 상황 발생 시 5초 이내 알림")],
    },
    {
      id: "SIR-003",
      category: "연계",
      text: "기존 WMS/TMS 3종과 표준 API로 연계해야 한다.",
      priority: "필수",
      sourceRefs: [ref(18, "기존 WMS/TMS 3종과 표준 API 연계")],
    },
    {
      id: "PER-004",
      category: "성능",
      text: "일 500만 건 이상의 물류 이벤트를 지연 없이 처리해야 한다.",
      priority: "필수",
      sourceRefs: [ref(18, "일 500만 건 이상 데이터 처리")],
    },
    {
      id: "SER-005",
      category: "보안",
      text: "개인정보는 비식별 처리 후 저장하며 접근 이력을 보관해야 한다.",
      priority: "필수",
      sourceRefs: [ref(52, "개인정보 비식별 처리 필수")],
    },
    {
      id: "ECR-006",
      category: "제약",
      text: "민간 클라우드 활용이 가능하며 국내 리전에 한정한다.",
      priority: "권장",
      sourceRefs: [ref(48, "클라우드 기반 구축 (민간 클라우드 허용)")],
    },
    {
      id: "SFR-007",
      category: "기능",
      text: "관제 이력 및 조치 결과를 리포트로 산출할 수 있어야 한다.",
      priority: "권장",
      sourceRefs: [ref(26, "일·월 단위 관제 리포트 제공")],
    },
  ],
  domains: [
    { name: "통합관제", desc: "실시간 모니터링, 알림, 조치 관리", reqCount: 9 },
    { name: "데이터 연계", desc: "WMS/TMS 연계, 표준화, 적재", reqCount: 6 },
    { name: "분석·리포트", desc: "KPI 산출, 통계, 리포트 자동화", reqCount: 5 },
    { name: "보안·개인정보", desc: "비식별, 접근통제, 감사로그", reqCount: 4 },
    { name: "운영·이관", desc: "교육, 매뉴얼, 하자보수", reqCount: 3 },
  ],
  explicitFeatures: [
    { text: "실시간 통합관제 대시보드", sourceRefs: [ref(13, "단일 화면에서 조회")] },
    { text: "이상 상황 알림(5초 이내)", sourceRefs: [ref(13, "5초 이내 알림")] },
    { text: "WMS/TMS 표준 API 연계", sourceRefs: [ref(18, "표준 API 연계")] },
    { text: "관제 리포트 자동 산출", sourceRefs: [ref(26, "일·월 단위 관제 리포트")] },
  ],
  hiddenFeatures: [
    {
      text: "거점별 데이터 품질 모니터링",
      reason: "표준화 요구가 있으나 품질 검증 수단이 명시되지 않아 필요",
    },
    {
      text: "알림 피로도 관리(중복 알림 억제)",
      reason: "5초 알림 요건 충족 시 과다 알림 발생 가능",
    },
    {
      text: "장애 대비 이중화 및 무중단 배포",
      reason: "24시간 관제 특성상 가용성 확보 수단 필요",
    },
    {
      text: "모바일 알림 수신 화면",
      reason: "현장 담당자 대응 흐름상 필요하나 RFP에 미기재",
    },
  ],
  kpis: [
    {
      metric: "알림 지연시간",
      target: "5",
      unit: "초 이내",
      sourceRefs: [ref(13, "5초 이내 알림")],
    },
    {
      metric: "일 처리 이벤트",
      target: "5,000,000",
      unit: "건/일",
      sourceRefs: [ref(18, "일 500만 건 이상")],
    },
    {
      metric: "시스템 가용성",
      target: "99.9",
      unit: "%",
      sourceRefs: [ref(33, "연간 가용성 99.9% 이상 보장")],
    },
    {
      metric: "통계 산출 시간",
      target: "1",
      unit: "시간 이내",
      sourceRefs: [ref(6, "현행 통계 산출 평균 3일 소요")],
    },
  ],
  riskAreas: [
    {
      area: "레거시 WMS 3종 동시 연계",
      reason: "기관별 데이터 표준이 상이하고 연계 규격 미제공",
      level: "높음",
    },
    {
      area: "일 500만 건 실시간 처리",
      reason: "성능 검증 환경 및 테스트 데이터 확보 필요",
      level: "높음",
    },
    { area: "10개월 내 12개 거점 이관", reason: "현장 병행 운영 기간 확보 필요", level: "중간" },
    { area: "개인정보 비식별 기준", reason: "기관 내부 기준 미공개", level: "중간" },
  ],
};

export const ingestJobs: IngestJob[] = [
  {
    id: "ig-1",
    fileName: "2025_공항공사_스마트관제_제안서_v3.pptx",
    totalSlides: 84,
    doneSlides: 84,
    status: "done",
    startedAt: "어제 18:05",
  },
  {
    id: "ig-2",
    fileName: "2025_물류공사_WMS고도화_제안서.pptx",
    totalSlides: 66,
    doneSlides: 41,
    status: "processing",
    startedAt: "오늘 10:31",
  },
  {
    id: "ig-3",
    fileName: "2024_철도공단_통합관제_제안서.pptx",
    totalSlides: 72,
    doneSlides: 0,
    status: "pending",
    startedAt: "-",
  },
];

export const slides: SlideItem[] = [
  {
    id: "s-1",
    deckName: "2025_공항공사_스마트관제_제안서_v3.pptx",
    slideNumber: 12,
    title: "통합관제 목표 아키텍처",
    description: "수집–적재–분석–관제 4계층 구조와 연계 대상 시스템을 표현한 아키텍처 장표",
    tags: ["아키텍처", "관제", "데이터연계"],
    status: "done",
    accent: "var(--color-chart-1)",
    layout: "diagram",
  },
  {
    id: "s-2",
    deckName: "2025_공항공사_스마트관제_제안서_v3.pptx",
    slideNumber: 27,
    title: "실시간 이상감지 처리 흐름",
    description: "이벤트 수집부터 알림 발송까지 3초 이내 처리 흐름과 임계치 정책",
    tags: ["이상감지", "실시간", "알림"],
    status: "done",
    accent: "var(--color-chart-2)",
    layout: "diagram",
  },
  {
    id: "s-3",
    deckName: "2025_물류공사_WMS고도화_제안서.pptx",
    slideNumber: 8,
    title: "사업 추진 체계 및 조직",
    description: "PM/PL 구성, 역할과 책임(R&R), 투입 M/M 요약 표",
    tags: ["추진체계", "조직", "M/M"],
    status: "done",
    accent: "var(--color-chart-3)",
    layout: "table",
  },
  {
    id: "s-4",
    deckName: "2025_물류공사_WMS고도화_제안서.pptx",
    slideNumber: 33,
    title: "데이터 표준화 방안",
    description: "이기종 WMS 데이터 표준 스키마 매핑 및 품질 검증 절차",
    tags: ["데이터표준", "품질", "WMS"],
    status: "done",
    accent: "var(--color-chart-4)",
    layout: "bullets",
  },
  {
    id: "s-5",
    deckName: "2024_철도공단_통합관제_제안서.pptx",
    slideNumber: 45,
    title: "성능 확보 방안 및 검증 결과",
    description: "초당 6,000 TPS 처리 벤치마크 결과와 확장 전략",
    tags: ["성능", "TPS", "검증"],
    status: "done",
    accent: "var(--color-chart-5)",
    layout: "chart",
  },
  {
    id: "s-6",
    deckName: "2024_철도공단_통합관제_제안서.pptx",
    slideNumber: 51,
    title: "가용성 확보 및 무중단 운영",
    description: "이중화 구성, 장애 조치 시나리오, 99.95% 가용성 실적",
    tags: ["가용성", "이중화", "운영"],
    status: "processing",
    accent: "var(--color-chart-1)",
    layout: "diagram",
  },
  {
    id: "s-7",
    deckName: "2025_공항공사_스마트관제_제안서_v3.pptx",
    slideNumber: 63,
    title: "관제 KPI 리포트 예시",
    description: "일·월 단위 KPI 대시보드 화면 예시와 산출 로직",
    tags: ["KPI", "리포트", "대시보드"],
    status: "done",
    accent: "var(--color-chart-2)",
    layout: "chart",
  },
  {
    id: "s-8",
    deckName: "2025_물류공사_WMS고도화_제안서.pptx",
    slideNumber: 58,
    title: "이행 일정 및 마일스톤",
    description: "10개월 단계별 일정, 주요 산출물, 검수 시점",
    tags: ["일정", "마일스톤"],
    status: "done",
    accent: "var(--color-chart-3)",
    layout: "table",
  },
];

export const ingestResult = { indexed: 84, failed: 2, skipped: 5 };

export const searchResults: SearchResult[] = slides.slice(0, 8).map((s, i) => ({
  ...s,
  status: "done",
  similarity: [0.93, 0.9, 0.71, 0.86, 0.83, 0.79, 0.76, 0.68][i] as number,
  year: [2025, 2025, 2025, 2025, 2024, 2024, 2025, 2025][i] as number,
  projectType: ["관제", "관제", "일반", "데이터", "관제", "관제", "관제", "일반"][i] as string,
}));

export const slidePlans: SlidePlan[] = [
  {
    id: "p-1",
    title: "통합관제 목표 아키텍처",
    governingMessage:
      "12개 거점 데이터를 표준 계층으로 통합해 단일 화면에서 5초 이내 관제가 가능한 구조를 제시합니다.",
    blocks: [
      { id: "b-1", type: "구성도", text: "수집 – 표준화 – 적재 – 관제 4계층 아키텍처 다이어그램" },
      { id: "b-2", type: "설명", text: "거점별 WMS/TMS 3종 표준 API 연계 방식" },
      { id: "b-3", type: "차별점", text: "스트림 처리 기반 5초 이내 알림 파이프라인" },
    ],
    metrics: [
      { label: "알림 지연", value: "5", unit: "초 이내", sourceRef: "RFP p.13" },
      { label: "일 처리량", value: "500만", unit: "건/일", sourceRef: "RFP p.18" },
    ],
    sourceRefs: [ref(13, "단일 화면에서 조회"), ref(18, "일 500만 건 이상 데이터 처리")],
    referenceSlideIds: ["s-1", "s-2"],
    status: "approved",
  },
  {
    id: "p-2",
    title: "데이터 표준화 및 품질 확보 방안",
    governingMessage:
      "이기종 데이터의 표준 스키마 매핑과 자동 품질 검증으로 통계 산출 시간을 3일에서 1시간으로 단축합니다.",
    blocks: [
      { id: "b-4", type: "프로세스", text: "매핑 정의 → 변환 → 품질 검증 → 예외 처리 흐름" },
      { id: "b-5", type: "표", text: "시스템별 표준 필드 매핑 예시" },
    ],
    metrics: [{ label: "통계 산출", value: "1", unit: "시간 이내", sourceRef: "RFP p.6" }],
    sourceRefs: [ref(6, "현행 통계 산출 평균 3일 소요")],
    referenceSlideIds: ["s-4"],
    status: "approved",
  },
  {
    id: "p-3",
    title: "가용성 및 무중단 운영 방안",
    governingMessage:
      "이중화와 무중단 배포로 24시간 관제 환경에서 99.9% 이상 가용성을 보장합니다.",
    blocks: [
      { id: "b-6", type: "구성도", text: "이중화 인프라 구성도" },
      { id: "b-7", type: "시나리오", text: "장애 유형별 조치 시나리오 3종" },
    ],
    metrics: [{ label: "가용성", value: "99.9", unit: "%", sourceRef: "RFP p.33" }],
    sourceRefs: [ref(33, "연간 가용성 99.9% 이상 보장")],
    referenceSlideIds: ["s-6"],
    status: "draft",
  },
];

export const generatedSlides: GeneratedSlide[] = [
  { slideNumber: 1, title: "통합관제 목표 아키텍처", planId: "p-1", accent: "var(--color-chart-1)", layout: "diagram" },
  { slideNumber: 2, title: "데이터 표준화 및 품질 확보 방안", planId: "p-2", accent: "var(--color-chart-2)", layout: "bullets" },
  { slideNumber: 3, title: "실시간 이상감지 처리 흐름", planId: "p-1", accent: "var(--color-chart-3)", layout: "diagram" },
  { slideNumber: 4, title: "관제 KPI 리포트 구성", planId: "p-2", accent: "var(--color-chart-4)", layout: "chart" },
];

export const reviewIssues: ReviewIssue[] = [
  {
    id: "r-1",
    type: "요구사항 누락",
    severity: "critical",
    slideNumber: 14,
    message: "SER-005(개인정보 비식별 처리) 관련 내용이 제안서에 포함되지 않았습니다.",
    evidence: "RFP p.52 «개인정보 비식별 처리 필수»",
    suggestion: "보안 방안 장표에 비식별 처리 절차와 접근 이력 관리 방안을 추가하세요.",
  },
  {
    id: "r-2",
    type: "정량 수치 변경",
    severity: "critical",
    slideNumber: 22,
    message: "알림 지연 목표가 '10초 이내'로 기재되어 RFP 요구치(5초)와 다릅니다.",
    evidence: "RFP p.13 «이상 상황 발생 시 5초 이내 알림»",
    suggestion: "수치를 5초 이내로 수정하고 근거 아키텍처를 함께 표기하세요.",
  },
  {
    id: "r-3",
    type: "근거 없는 표현",
    severity: "warning",
    slideNumber: 31,
    message: "'업계 최고 수준의 처리 성능' 표현에 대한 근거가 없습니다.",
    evidence: "슬라이드 31 본문",
    suggestion: "벤치마크 결과(6,000 TPS) 등 실측 근거를 인용하거나 표현을 완화하세요.",
  },
  {
    id: "r-4",
    type: "레이아웃 문제",
    severity: "warning",
    slideNumber: 45,
    message: "본문 텍스트가 하단 여백을 초과하여 잘릴 가능성이 있습니다.",
    evidence: "텍스트 박스 높이 초과 12pt",
    suggestion: "블록을 2단으로 분할하거나 문장을 축약하세요.",
  },
  {
    id: "r-5",
    type: "정량 수치 변경",
    severity: "info",
    slideNumber: 58,
    message: "가용성 수치가 장표별로 99.9%와 99.95%로 혼재되어 있습니다.",
    evidence: "슬라이드 51, 58 비교",
    suggestion: "제안 기준값을 99.9%로 통일하세요.",
  },
  {
    id: "r-6",
    type: "요구사항 누락",
    severity: "warning",
    slideNumber: 0,
    message: "SFR-007(관제 리포트 자동 산출) 대응 장표가 없습니다.",
    evidence: "RFP p.26 «일·월 단위 관제 리포트 제공»",
    suggestion: "KPI 리포트 예시 장표를 추가하세요.",
  },
];

export const reviewSummary = { score: 78, critical: 2, warning: 3, info: 1 };
