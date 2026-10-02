# 채용 정책 반응 시뮬레이터 — 프런트엔드 페이지 설계

- 날짜: 2026-10-02
- 범위: `mirofish/frontend`에 새 페이지 추가 (백엔드 수정 없음)
- 근거 문서: 채용 정책 반응 시뮬레이터 PRD (해커톤 MVP)

## 1. 목표

PRD 5번 흐름에서 지원자 구성 단계를 뺀 흐름(시나리오 작성 → 실행 전 확인 → 시뮬레이션 피드 → 리포트)을 한 페이지에서 끝까지 실행할 수 있게 한다. 데이터는 실제 MiroFish 백엔드에서 받는다.

성공 기준(PRD 10번):
- 한 화면에서 시나리오를 입력하고 실행할 수 있다.
- 여러 에이전트가 게시글과 답글을 주고받는 장면이 시각적으로 확인된다.
- 리포트의 주요 요약을 시뮬레이션 대화로 추적할 수 있다.
- 사용자가 참여할 지원자 유형을 고르거나 조정할 수 있다.
- 화면과 리포트에서 결과가 가상 시뮬레이션임이 분명하다.

## 2. 결정 사항

| 항목 | 결정 | 이유 |
|---|---|---|
| 데이터 소스 | 실제 MiroFish 백엔드 연동 (mock 없음) | 사용자 선택 |
| 프로필 반영 | 시드 문서에 서술 (A안), 백엔드 수정 없음 | 통합 범위 확대 방지 |
| 지원자 구성 | 고정 기본 4명을 자동 적용, 사용자 편집·선택 없음 (실행 전 확인 화면에서 읽기 전용으로 표시) | 사용자 결정. 입력 부담을 없애고, LLM 생성은 백엔드 수정이 필요하며 다양성을 보장하기 어려워 제외 |
| UI 재사용 | 기존 Step1~5 컴포넌트와 `GraphPanel` 미사용, `api/*.js`만 재사용 | 기존 컴포넌트는 크고 문서 업로드를 전제로 함 |
| 언어 | 화면·시드 문서·리포트 요청문을 영어로 하드코딩(i18n 미적용). 페이지가 열려 있는 동안 요청 로케일을 `en`으로 지정하고 떠나면 복원. 화면에 MiroFish 브랜드 문구를 쓰지 않고 탭 제목도 바꿨다가 복원 | 사용자 결정. 백엔드는 `Accept-Language`(기본 `zh`)로 LLM 응답 언어를 정하고 한국어 로케일이 없다 |
| 스타일 | 기존 흑백·모노스페이스 톤 | 기존 앱과 일관성 |

## 3. 구조

- 라우트: `/hiring-sim` → `views/HiringSim.vue` (3단계 전환: 시나리오 / 실행 전 확인 / 피드·리포트)
- `components/hiring/`: `ScenarioStep.vue`, `ReviewStep.vue`(실행 전 확인), `FeedStep.vue`, `ReportStep.vue`
- `data/defaultProfiles.js`: 기본 프로필 4종 (첫 취업 준비, 재직 중 이직 준비, 여러 회사 과제 병행, 평가 기준·소요 시간 중시). 구직 상황·시간 여유·경험·우선순위만 기술하고 인구통계 속성은 쓰지 않는다.
- `lib/hiringSim.js`: 순수 함수(`buildSeedDoc`, `parseReport`, `matchEvidence`, `buildFeed`, `pollUntil` 등). node로 직접 검증하려고 axios/i18n 의존성이 없는 별도 파일에 둔다.
- `api/hiringSim.js`: 기존 `api/graph.js`, `simulation.js`, `report.js`를 순서대로 호출하고 폴링하는 재개 가능한 오케스트레이션.

## 4. 입력 → 시드 문서

- 직무/레벨, 정책, 세부사항, 질문, 배경(선택), 기본 프로필 4명을 `.md` Blob 하나로 조립한다(`buildSeedDoc`). 프로필은 소제목이 아니라 가명을 가진 **개인 구직자 한 명**을 서술하는 문장으로 쓴다(소제목은 그래프 구축 단계에서 조직 엔티티로 추출되어 단체 계정이 생긴다). 각 프로필에는 고정 가명이 있고, `simulation_requirement`에도 "정책·회사·커뮤니티 같은 조직이나 개념은 에이전트가 아니다"를 명시한다.
- `simulation_requirement`에는 시뮬레이션 질문과 함께 PRD 8번 리포트 섹션(핵심 요약, 반복 우려·긍정 반응, 변화한 논점, 갈린 관점, 개선안, 각 항목의 대화 발췌 인용)을 요청하는 문장을 넣어 ReportAgent의 목차를 유도한다.
- 에이전트 수는 백엔드 기본 흐름에 맡기고, 라운드는 상수 기본값 `max_rounds = 6`으로 둔다. 첫 실행 후 조정한다.
- 필수 입력(직무/레벨, 정책, 세부사항, 질문)이 비어 있으면 다음 단계로 넘어가지 못한다. 실제 개인정보나 민감한 채용 자료를 요구하지 않는다.

## 5. 파이프라인

`generateOntology`(FormData) → `buildGraph` → `getTaskStatus` 폴링 → `createSimulation` → `prepareSimulation` → `getPrepareStatus` 폴링 → `startSimulation` → `getRunStatusDetail` 폴링 → `generateReport` → `getReportStatus` 폴링 → 리포트 조회

- 각 단계는 상단 진행 표시줄에 표시한다.
- 단계 실패 시 실패한 단계 이름과 백엔드 에러 메시지를 보여 주고 해당 단계부터 재시도할 수 있다.
- 폴링 타이머는 컴포넌트 unmount 시 정리한다.
- 리포트 완료 여부는 `getReport`를 폴링해 `status`로 판단한다(`api/report.js`의 `getReportStatus`는 백엔드 POST 라우트와 메서드가 달라 쓰지 않는다). 피드 플랫폼은 `reddit` 단일이다.

## 6. 피드

- `/prepare` 완료 후 **실제 생성된 에이전트 목록**(`getSimulationProfiles`)을 보여 준다. A안에서는 기본 프로필과 생성된 에이전트가 일치하지 않을 수 있으므로 이를 숨기지 않는다.
- 피드는 `getSimulationPosts`와 댓글 API(`/simulation/{id}/comments`)를 폴링해 시간순으로 렌더링한다. 작성자 옆에 프로필 기반 짧은 라벨을 붙이고, 댓글은 원글 아래에 스레드로 표시한다.
- DB 행(`post`: post_id, user_id, content / `comment`: comment_id, post_id, user_id, content)에는 `user_id`만 있다. `user_id`는 `/profiles` 목록의 인덱스(= agent_id)와 일치하므로 작성자 이름과 라벨(`profession` 또는 `bio` 앞부분)은 프로필 목록에서 붙인다. `/actions`는 라운드가 끝난 뒤에야 기록되어 실행 중에는 비어 있으므로, 본문 일치로 라운드 번호를 붙이는 데에만 쓴다. OASIS 댓글은 글 아래 평평하게 달리며 대댓글 id가 없다.
- OASIS 에이전트는 자기 글에 스스로 댓글을 달기도 한다(한 실행에서 댓글 6개 중 2개). 백엔드 동작이라 데이터는 지우지 않고(리포트 인용 추적이 깨지지 않도록), 피드에서 "(replying to their own post)"로 표시하고 흐리게 보여 준다.

## 7. 리포트와 근거 추적

- 리포트 본문은 `getReport` 또는 `/report/{id}/sections`의 마크다운을 렌더링한다.
- 백엔드는 구조화된 근거 링크를 제공하지 않는다. 리포트의 인용문(blockquote)을 피드의 게시글·댓글 원문과 부분 문자열로 매칭하고(`matchEvidence`), 일치하면 클릭 시 피드의 해당 글로 이동한다. 일치하지 않는 인용은 "원문 미확인"으로 표시한다.
- 한계: LLM이 인용문을 원문과 다르게 요약하면 매칭이 실패해 근거 링크가 빈 항목이 생길 수 있다.

## 8. 가상 시뮬레이션 고지

- 모든 화면 상단에 "Simulated scenario — not real applicant data or a prediction" 배너를 고정한다.
- 리포트에는 "Qualitative results limited to this applicant set and this run."를 명시한다.
- 에이전트 수를 실제 지원자 모집단이나 통계 비율처럼 표현하지 않는다.
- 실행 전 확인 단계에서 자동 적용되는 프로필과 우선순위를 읽기 전용으로 보여 준다.

## 9. 검증

- `buildSeedDoc`과 `matchEvidence`는 `assert` 기반 자가검증 스크립트 하나로 확인한다(프레임워크 없음).
- 나머지는 백엔드(`.env`에 LLM·Zep 키 필요)와 프런트를 띄워 데모 시나리오(4시간 무급 코딩 과제)를 끝까지 실행해 확인한다.

## 10. 범위 밖

- 두 정책의 병렬 실행·비교
- 실제 지원자 데이터, 합격률·이탈률 수치 예측
- 지원자 프로필 선택·수정·추가(PRD 7번의 커스터마이징)와 LLM 기반 지원자 자동 생성
- 백엔드 수정(커스텀 프로필 주입 엔드포인트 등)
- i18n
- 외부 사이트 게시·연동
