# Proposal Studio

제안 업무 자동화를 위한 내부 웹 도구의 React 프론트엔드를 만들고 싶다.

중요:

지금은 백엔드를 구현하지 않는다.

외부 API, DB, 인증, Supabase 등을 임의로 추가하지 않는다.

필요한 데이터는 mock data로 구성한다.

이 서비스는 하나의 고정된 workflow만 수행하는 앱이 아니라,

제안 업무에서 반복되는 여러 자동화 기능을 각각 독립적으로 사용할 수 있는 업무도구 모음이다.

현재 계획 중인 주요 기능은 다음과 같다.

1. 문서 변환

- HWP/HWPX/PDF/DOCX 파일 업로드

- 변환된 Markdown 또는 구조화 텍스트 확인

- 결과 다운로드

- 이 기능만 독립적으로 사용할 수 있어야 한다.

2. RFP 분석

- RFP 파일 또는 변환 결과 입력

- 사업 개요

- 목표 업무 흐름

- 요구사항

- 기능 도메인

- 명시된 기능

- 숨은/보완 기능

- 정량 요구사항/KPI

- 수행이 어려운 영역

을 확인할 수 있게 한다.

- 분석 결과에서 원문 근거(source reference)를 확인할 수 있어야 한다.

3. 기존 PPT 등록 / Ingest

- 기존 제안서 PPTX 업로드

- 슬라이드별 분석 진행 상태 표시

- 각 슬라이드의 제목, 설명, 태그, 미리보기 확인

- 검색 DB 등록 결과 확인

- 이 기능도 독립적으로 실행 가능해야 한다.

4. 기존 제안서 검색

- 자연어로 과거 제안 장표 검색

- 검색 결과를 슬라이드 카드로 보여준다.

- 썸네일, 제목, 원본 PPT, slide number, 설명, 태그, similarity 정보를 표현한다.

- 선택한 장표를 크게 미리볼 수 있다.

5. 제안 장표 기획

- 요구사항 또는 사용자가 직접 입력한 설명을 기반으로 장표 기획 결과 표시

- 제목, governing message, 핵심 블록, 사용할 정량지표, source reference, 참고 장표 표시

- 사용자가 수정하고 승인할 수 있게 한다.

6. PPT 생성

- 승인된 장표 기획을 기반으로 생성

- 생성 결과 및 PPTX 다운로드 영역

7. PPT 검수

- 기존 PPTX 또는 생성 결과를 입력

- 요구사항 누락

- 정량 수치 변경

- 근거 없는 표현

- 레이아웃 문제

등의 검수 결과를 보여준다.

현재는 각 기능이 실제로 작동할 필요는 없다.

mock data를 사용해 UX와 화면 구조를 먼저 설계한다.

디자인 방향:

- 화려한 AI 서비스 랜딩페이지가 아니라 실제 회사에서 매일 사용하는 내부 업무도구 느낌

- 정보 밀도가 높지만 복잡해 보이지 않게

- 제안 PM이나 사업기획 담당자가 빠르게 사용할 수 있게

- desktop 우선

- shadcn/ui 활용

- 지나친 gradient, glassmorphism, 거대한 hero section 금지

메인 화면에서는 위 기능들을 각각 독립적인 Tool로 진입할 수 있게 한다.

사용자가 반드시 정해진 순서를 따라야 하는 wizard UI로 만들지 않는다.

먼저 구현하지 말고,

추천하는 Information Architecture와 주요 화면 구성을 제안해줘.

각 화면에서 필요한 데이터도 함께 정리해줘.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/63b22f11-9ebd-4050-9de6-29d984abca6e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
