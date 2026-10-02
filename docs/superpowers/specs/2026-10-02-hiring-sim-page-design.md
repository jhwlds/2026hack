# 채용 정책 반응 시뮬레이터 — 프런트엔드 페이지 설계

- 날짜: 2026-10-02 (구현 중 사용자 결정을 반영해 갱신)
- 범위: `mirofish/frontend`에 새 페이지 추가 (백엔드 수정 없음)
- 근거 문서: 채용 정책 반응 시뮬레이터 PRD (해커톤 MVP)

## 1. 목표

원래 MiroFish처럼 **입력 두 개(월드 시드 파일 하나, 시뮬레이션 요구사항 텍스트 하나)** 로 시작해, 실행 전 확인 → 시뮬레이션 피드 → 근거가 연결된 리포트까지 한 페이지에서 끝까지 실행한다. 데이터는 실제 MiroFish 백엔드에서 받는다.

성공 기준(PRD 10번 중 이번 설계에서 유지하는 것):
- 한 화면에서 입력하고 실행할 수 있다.
- 여러 에이전트가 게시글과 답글을 주고받는 장면이 시각적으로 확인된다.
- 리포트의 주요 요약을 시뮬레이션 대화로 추적할 수 있다.
- 화면과 리포트에서 결과가 가상 시뮬레이션임이 분명하다.

PRD에서 **의도적으로 뺀 것**: 지원자 프로필의 선택·수정·추가(PRD 7번), 직무·정책·세부사항 등 개별 입력 필드(PRD 6번). 지원자는 시드 파일에 들어 있는 개인으로 정해진다.

## 2. 결정 사항

| 항목 | 결정 | 이유 |
|---|---|---|
| 데이터 소스 | 실제 MiroFish 백엔드 연동 (mock 없음) | 사용자 선택 |
| 입력 | 월드 시드 파일 1개(PDF/MD/TXT/MARKDOWN, 50MB 이하, 필수) + 시뮬레이션 요구사항 텍스트 1개(필수) | 사용자 결정. 원래 MiroFish와 같은 입력 모델. 지난 실험에서 시나리오 필드로 쓴 직무·세부사항·회사 컨텍스트가 대화에 거의 반영되지 않았음 |
| 지원자 | 시드 파일 안에 개인 구직자로 서술되어 있어야 함. 앱은 지원자를 만들거나 편집하지 않음 | 사용자 결정. 잡포스팅만 올리면 회사·담당자만 엔티티가 되므로 샘플 파일(`docs/samples/sample-job-posting.md`)에 작성 방법을 보여 줌 |
| 요구사항 텍스트 | 사용자 텍스트를 맨 앞에 두고, 제품이 매 실행마다 필요한 고정 문장(에이전트는 개인 구직자, 타입 이름 규칙, PRD 8번 리포트 섹션, 원문 발췌 인용, 가상 분석 고지)을 뒤에 붙여 `simulation_requirement`로 보낸다 | 리포트 에이전트가 PRD의 목차와 인용 형식을 따르게 하기 위함 |
| 에이전트 제한 | 요구사항에서 지원자 엔티티 타입 이름을 `JobSeeker`로 끝나게 요구하고, 온톨로지 결과에서 그 이름의 타입만 `/prepare`의 `entity_types`로 넘긴다. 일치하는 타입이 없으면 필터 없이 진행 | 첫 실행에서 정책·직무·커뮤니티가 에이전트로 생성됨. 실제로 시드 문서의 담당자 등은 제외되었음. LLM이 이름 규칙을 어길 수 있음 |
| UI 재사용 | 기존 Step1~5 컴포넌트와 `GraphPanel` 미사용, `api/*.js`만 재사용 | 기존 컴포넌트는 파일이 크고 그래프 패널과 결합되어 있음 |
| 언어 | 화면·요구사항 고정 문장을 영어로 하드코딩(i18n 미적용). 페이지가 열려 있는 동안 요청 로케일을 `en`으로 지정하고 떠나면 복원. MiroFish 브랜드 문구를 쓰지 않고 탭 제목도 바꿨다가 복원 | 사용자 결정. 백엔드는 `Accept-Language`(기본 `zh`)로 LLM 응답 언어를 정하고 한국어 로케일이 없음 |
| 스타일 | 기존 흑백·모노스페이스 톤 | 기존 앱과 일관성 |

## 3. 구조

- 라우트: `/hiring-sim` → `views/HiringSim.vue` (3단계: 시드·질문 입력 / 실행 전 확인 / 피드·리포트)
- `components/hiring/`: `ScenarioStep.vue`(파일 + 텍스트), `ReviewStep.vue`, `FeedStep.vue`, `ReportStep.vue`
- `lib/hiringSim.js`: 순수 함수(`validateInput`, `buildRequirement`, `pickApplicantTypes`, `parseReport`, `matchEvidence`, `buildFeed`, `pollUntil`)와 상수. node로 직접 검증하려고 axios/i18n 의존성이 없는 별도 파일에 둔다. 검증 스크립트는 `lib/hiringSim.check.mjs`.
- `api/hiringSim.js`: 기존 `api/graph.js`, `simulation.js`, `report.js`를 순서대로 호출하고 폴링하는 재개 가능한 오케스트레이션(`runPipeline`).

## 4. 입력

- 파일: 확장자 `pdf`/`md`/`txt`/`markdown`, 크기 50MB 이하(백엔드 `Config`와 같은 값). 하나만 받는다.
- 텍스트: 비어 있으면 진행할 수 없다. 데모 실행을 위해 기본 문장이 채워져 있다.
- 에이전트 수는 백엔드 기본 흐름에 맡기고, 라운드는 상수 `MAX_ROUNDS = 6`(`runPipeline`의 `maxRounds`로 덮어쓸 수 있음)이다.
- 실제 개인정보나 민감한 채용 자료를 요구하지 않으며, 화면에 가상 자료 사용을 안내한다.

## 5. 파이프라인

`generateOntology`(FormData: 파일 + 요구사항) → `buildGraph` → `getTaskStatus` 폴링 → `createSimulation` → `prepareSimulation`(`entity_types`) → `getPrepareStatus` 폴링 → `startSimulation` → `getRunStatus` 폴링 → `generateReport` → `getReport` 폴링

- 각 단계는 상단 진행 표시줄에 표시한다.
- 단계 실패 시 실패한 단계 이름과 백엔드 에러 메시지를 보여 주고 해당 단계부터 재시도할 수 있다.
- 폴링 타이머는 컴포넌트 unmount 시 정리한다.
- 리포트 완료 여부는 `getReport`를 폴링해 `status`로 판단한다(`api/report.js`의 `getReportStatus`는 백엔드 POST 라우트와 메서드가 달라 쓰지 않는다).
- 시뮬레이션은 `parallel` 러너로 시작하고(`enable_twitter`/`enable_reddit` 모두 true) 피드는 `reddit` 쪽만 읽는다. 단일 플랫폼 러너는 완료 감지에 쓰이는 `actions.jsonl`을 쓰지 않아 끝나도 `running`으로 남기 때문이다.

## 6. 피드

- `/prepare` 완료 후 **실제 생성된 에이전트 목록**(`getSimulationProfiles`)을 보여 준다. 시드 파일의 개인과 생성된 에이전트가 일치하지 않을 수 있으므로 숨기지 않는다.
- 피드는 `getSimulationPosts`와 `getSimulationComments`를 3초마다 폴링해 렌더링한다. 작성자 옆에 프로필 기반 짧은 라벨을 붙이고, 댓글은 원글 아래에 스레드로 표시한다.
- DB 행(`post`: post_id, user_id, content / `comment`: comment_id, post_id, user_id, content)에는 `user_id`만 있다. `user_id`는 `/profiles` 목록의 인덱스(= agent_id)와 일치하므로 작성자 이름과 라벨(`profession` 또는 `bio` 앞부분)은 프로필 목록에서 붙인다. `/actions`는 라운드가 끝난 뒤에야 기록되어 실행 중에는 비어 있으므로, 본문 일치로 라운드 번호를 붙이는 데에만 쓴다. OASIS 댓글은 글 아래 평평하게 달리며 대댓글 id가 없다.
- OASIS 에이전트는 자기 글에 스스로 댓글을 달기도 한다(한 실행에서 댓글 6개 중 2개). 백엔드 동작이라 데이터는 지우지 않고(리포트 인용 추적이 깨지지 않도록), 피드에서 "(replying to their own post)"로 표시하고 흐리게 보여 준다.

## 7. 리포트와 근거 추적

- 리포트 본문은 `getReport`의 `markdown_content`를 렌더링한다. 모든 텍스트는 `v-html` 없이 `{{ }}`로만 출력한다.
- 백엔드는 구조화된 근거 링크를 제공하지 않는다. 리포트의 인용문(blockquote)을 피드의 게시글·댓글 원문과 부분 문자열로 매칭하고(`matchEvidence`), 일치하면 "View source"로 피드의 해당 글로 이동한다. 일치하지 않는 인용은 "Source not found"로 표시한다.
- 한계: LLM이 인용문을 원문과 다르게 요약하면 매칭이 실패해 근거 링크가 빈 항목이 생길 수 있다.

## 8. 가상 시뮬레이션 고지

- 모든 화면 상단에 "Simulated scenario — not real applicant data or a prediction" 배너를 고정한다.
- 리포트에는 "Qualitative results limited to this applicant set and this run."를 명시한다.
- 에이전트 수를 실제 지원자 모집단이나 통계 비율처럼 표현하지 않는다.
- 실행 전 확인 단계에서 시드 파일 이름과 요구사항 텍스트를 보여 주고, 결과가 그 시드에 좌우됨을 안내한다.

## 9. 검증

- 순수 함수는 `assert` 기반 자가검증 스크립트 하나로 확인한다(프레임워크 없음): `node src/lib/hiringSim.check.mjs`.
- 나머지는 백엔드(`.env`에 LLM·Zep 키 필요)와 프런트를 띄워 샘플 시드(`docs/samples/sample-job-posting.md`)로 끝까지 실행해 확인한다.

## 10. 범위 밖

- 두 정책의 병렬 실행·비교
- 실제 지원자 데이터, 합격률·이탈률 수치 예측
- 지원자 프로필의 선택·수정·추가, 앱이 지원자를 자동 생성하는 기능
- 백엔드 수정
- i18n
- 외부 사이트 게시·연동
