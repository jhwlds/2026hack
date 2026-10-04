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
| 입력 | 월드 시드 파일 1개(PDF/MD/TXT/MARKDOWN, 50MB 이하, 필수) + 시뮬레이션 요구사항 텍스트 1개(필수). 사용자가 입력하는 것은 이 둘이며, 선택 사항으로 지원자 수만 더 고를 수 있다 | 사용자 결정. 원래 MiroFish와 같은 입력 모델. 지난 실험에서 시나리오 필드로 쓴 직무·세부사항·회사 컨텍스트가 대화에 거의 반영되지 않았음 |
| 지원자 | 실행하면 첫 단계(`Creating job seekers`)에서 백엔드 `POST /simulation/suggest-applicants`가 시드 파일과 질문으로 가상 지원자(이름, 상황, 페르소나)를 만든다. 수는 사용자가 입력 화면에서 2~8명(기본 4)으로 고른다. 결과는 `applicants.md`로 시드 파일과 함께 업로드된다. 생성이 실패하면 고정 지원자(최대 4명)로 대체하고 화면에 알린다. 시드 파일에 지원자 개인이 서술되어 있으면 그들도 참여한다 | 실제 채용 공고에는 사람이 없어 그래프가 `Organization`만 갖게 되고, 지원자 타입 필터 후 에이전트가 0개가 되어 실패했다. 원래 MiroFish도 참가자를 문서의 엔티티에서만 가져온다. 키는 서버에만 있어 프런트가 직접 호출할 수 없다 |
| 요구사항 텍스트 | 사용자 텍스트를 맨 앞에 두고, 제품이 매 실행마다 필요한 고정 문장(에이전트는 개인 구직자, 타입 이름 규칙, PRD 8번 리포트 섹션, 원문 발췌 인용, 가상 분석 고지)을 뒤에 붙여 `simulation_requirement`로 보낸다 | 리포트 에이전트가 PRD의 목차와 인용 형식을 따르게 하기 위함 |
| 에이전트 제한 | 요구사항에서 지원자 엔티티 타입 이름을 `JobSeeker`로 끝나게 요구하고, 온톨로지 결과에서 그 이름의 타입만 `/prepare`의 `entity_types`로 넘긴다. 일치하는 타입이 없으면 필터 없이 진행 | 첫 실행에서 정책·직무·커뮤니티가 에이전트로 생성됨. 실제로 시드 문서의 담당자 등은 제외되었음. LLM이 이름 규칙을 어길 수 있음 |
| UI 재사용 | 기존 Step1~5 컴포넌트와 `GraphPanel` 미사용, `api/*.js`만 재사용 | 기존 컴포넌트는 파일이 크고 그래프 패널과 결합되어 있음 |
| 언어 | 화면·요구사항 고정 문장을 영어로 하드코딩(i18n 미적용). 페이지가 열려 있는 동안 요청 로케일을 `en`으로 지정하고 떠나면 복원. MiroFish 브랜드 문구를 쓰지 않고 탭 제목도 바꿨다가 복원 | 사용자 결정. 백엔드는 `Accept-Language`(기본 `zh`)로 LLM 응답 언어를 정하고 한국어 로케일이 없음 |
| 스타일 | 기존 흑백·모노스페이스 톤 | 기존 앱과 일관성 |

## 3. 구조

- 라우트: `/hiring-sim/:simulationId?` → `views/HiringSim.vue` (3단계: 시드·질문 입력 / 실행 전 확인 / 타임라인·그래프·리포트). `simulationId`가 있으면 끝난 실행을 다시 연다.
- `components/hiring/`: `ScenarioStep.vue`(파일 + 텍스트), `ReviewStep.vue`, `FeedStep.vue`(진행 표시 + 에이전트 목록 + 타임라인), `ActionTimeline.vue`, `ReportStep.vue`, `RunHistory.vue`
- 기존 MiroFish에서 가져온 것: `components/GraphPanel.vue`(수정 없이 그대로 사용), `Step3Simulation.vue`의 액션 카드(템플릿, 헬퍼 4개, 스타일 47규칙을 `ActionTimeline.vue`로 복사. 원본은 수정하지 않음), `/simulation/history` API(기록 목록)
- `lib/hiringSim.js`: 순수 함수(`validateInput`, `buildRequirement`, `pickApplicantTypes`, `runPhase`, `parseReport`, `matchEvidence`, `buildTimeline`, `evidenceItems`, `summarizeRun`, `pollUntil`)와 상수. node로 직접 검증하려고 axios/i18n 의존성이 없는 별도 파일에 둔다. 검증 스크립트는 `lib/hiringSim.check.mjs`.
- `api/hiringSim.js`: 기존 `api/graph.js`, `simulation.js`, `report.js`를 순서대로 호출하고 폴링하는 재개 가능한 오케스트레이션(`runPipeline`).

## 4. 입력

- 파일: 확장자 `pdf`/`md`/`txt`/`markdown`, 크기 50MB 이하(백엔드 `Config`와 같은 값). 하나만 받는다.
- 텍스트: 비어 있으면 진행할 수 없다. 데모 실행을 위해 기본 문장이 채워져 있다.
- 에이전트 수는 백엔드 기본 흐름에 맡기고, 라운드는 상수 `MAX_ROUNDS = 6`(`runPipeline`의 `maxRounds`로 덮어쓸 수 있음)이다.
- 실제 개인정보나 민감한 채용 자료를 요구하지 않으며, 화면에 가상 자료 사용을 안내한다.

## 5. 파이프라인

지원자 생성(백엔드 `applicant_generator.py`)은 모델이 만든 결과를 서버에서 검증한다: 정확히 요청한 수, 이름은 한 단어이고 중복 없음, 문서에 나오는 사람 이름과 겹치지 않음, 상황이 서로 충분히 다름, 페르소나에 성별·나이·인종·종교·국적과 성별 대명사가 없음. 어긋나면 이유를 알려 주며 한 번 다시 시키고, 그래도 안 되면 오류로 처리한다.

지원자 파일(`buildApplicantsDoc`)은 지원자를 구직 상황과 페르소나로만 구분하고 나이·성별·국가를 쓰지 않으며 정책이나 과제를 가정하지 않는다. 고정 지원자(대체용)는 첫 취업, 재직 중 이직 준비, 여러 곳 동시 지원, 채용 과정 투명성 중시의 네 가지다. 각 지원자는 소제목이 아니라 "Individual job seeker Alex (pseudonym). ..." 문장으로 써서, 그래프 구축 때 조직이 아니라 개인 엔티티로 뽑히게 한다.

`suggestApplicants` → `generateOntology`(FormData: 시드 파일 + `applicants.md` + 요구사항) → `buildGraph` → `getTaskStatus` 폴링 → (지원자 엔티티 수 확인) → `createSimulation` → `prepareSimulation`(`entity_types`) → `getPrepareStatus` 폴링 → `startSimulation` → `getRunStatus` 폴링 → `generateReport` → `getReport` 폴링

- 에이전트 생성 전에 `/simulation/entities/:graphId`로 지원자 타입 엔티티가 1개 이상인지 확인하고, 0개면 백엔드의 중국어 오류 대신 영어 안내와 재시도를 보여 준다.
- 각 단계는 상단 진행 표시줄에 표시한다.
- 단계 실패 시 실패한 단계 이름과 백엔드 에러 메시지를 보여 주고 해당 단계부터 재시도할 수 있다.
- 폴링 타이머는 컴포넌트 unmount 시 정리한다.
- 리포트 완료 여부는 `getReport`를 폴링해 `status`로 판단한다(`api/report.js`의 `getReportStatus`는 백엔드 POST 라우트와 메서드가 달라 쓰지 않는다).
- 두 플랫폼이 끝나도 병렬 러너 프로세스는 인터뷰 명령을 기다리며 살아 있어 상태가 `running`으로 남는다. `runPhase`가 이 상태를 `closing`으로 판별하면 `close-env`를 보내 환경을 닫고, `stopping`을 거쳐 `completed`가 될 때까지 폴링한다.
- 리포트는 생성이 끝나 저장되기 전에는 `GET /report/:id`가 404를 돌려주므로, 404일 때는 `/report/:id/progress`로 상태를 확인하고(없으면 pending), `completed`이고 본문이 있을 때 끝난 것으로 본다.
- 시뮬레이션은 `parallel` 러너로 시작하고(`enable_twitter`/`enable_reddit` 모두 true) 피드는 `reddit` 쪽만 읽는다. 단일 플랫폼 러너는 완료 감지에 쓰이는 `actions.jsonl`을 쓰지 않아 끝나도 `running`으로 남기 때문이다.

## 6. 타임라인, 그래프, 기록

**액션 타임라인** (`ActionTimeline.vue`): 원래 MiroFish의 카드(POST, COMMENT, LIKE, QUOTE, REPOST, FOLLOW, SEARCH, 투표, IDLE)를 시간순으로 보여 준다. 에이전트 이름 옆에 프로필 라벨(`profession` 또는 `bio` 앞부분)을 붙인다.
- 데이터는 `/actions`(Reddit만)이다. 이 응답은 시간순 정렬이 보장되지 않아 `buildTimeline`이 `timestamp`로 정렬한다. 실행 중에는 3초마다 새로 읽는다.
- 댓글 액션에는 `comment_id`만 있고 `post_id`가 없다. 누구의 글에 단 댓글인지는 DB 행(`comment` → `post` → 작성자 `user_id`, 이는 `/profiles` 목록의 인덱스와 같다)으로 이어 "Reply to @이름's post"로 보여 준다.
- OASIS 에이전트는 자기 글에 스스로 댓글을 달기도 한다(한 실행에서 댓글 12개 중 4개). 백엔드 동작이라 데이터는 지우지 않고(리포트 인용 추적이 깨지지 않도록) "(their own post)"로 표시하고 카드를 흐리게 보여 준다.
- Twitter 쪽 액션은 보여 주지 않는다. 같은 에이전트가 두 플랫폼에서 비슷한 글을 쓰고, 근거 매칭과 댓글 연결이 Reddit DB 기준이기 때문이다.
- 시뮬레이션이 끝나면 생성된 **에이전트 목록**(`getSimulationProfiles`)을 접힌 상자로 보여 준다. 시드 파일의 개인과 생성된 에이전트가 일치하지 않을 수 있으므로 숨기지 않는다.

**엔티티 그래프** (`GraphPanel.vue`, 수정 없이 그대로 사용): 화면 왼쪽에 고정해 두고, 시드에서 어떤 엔티티가 뽑혔는지 보여 준다. 그래프 구축이 끝나면 불러오고, 실행 중에는 활동이 그래프에 다시 기록되므로 15초마다, 끝날 때 한 번 더 읽는다.

**기록 목록** (`RunHistory.vue`): 시드·질문 입력 화면 아래에 `/simulation/history`의 최근 20건을 카드로 보여 주고(제목은 저장된 요구사항의 첫 줄, 파일 이름, 라운드, 리포트 유무, 날짜), 누르면 `/hiring-sim/:id`로 열린다. 원본의 `HistoryDatabase.vue`(스크롤 애니메이션 카드, 상세 창이 원본 화면으로만 이동)는 우리 페이지로 열 수 없어 같은 API로 간단히 다시 만들었다. 목록을 불러오지 못해도 페이지는 동작한다.

**다시 열기**: 시뮬레이션 상태(`project_id`, `graph_id`), 프로필, 타임라인, 그래프, `/report/by-simulation/:id`의 리포트를 읽어 오기만 하고 아무것도 다시 실행하지 않는다. 리포트가 없는 실행은 타임라인과 그래프만 보여 준다. "새 실험 시작"은 `/hiring-sim`으로 돌아간다.

## 7. 리포트와 근거 추적

- 리포트 본문은 `getReport`의 `markdown_content`를 렌더링한다. 모든 텍스트는 `v-html` 없이 `{{ }}`로만 출력한다.
- 백엔드는 구조화된 근거 링크를 제공하지 않는다. 리포트의 인용문(blockquote)을 타임라인 카드(게시글·인용·댓글)의 본문과 부분 문자열로 매칭하고(`matchEvidence`), 일치하면 "View source"로 타임라인의 해당 카드로 이동한다. 일치하지 않는 인용은 "Source not found"로 표시한다.
- 매칭 규칙: 인용 속 따옴표 안 문장(줄임표로 나뉘면 가장 긴 조각)을 단어로 나눠, 한 게시글·댓글에서 그 단어들이 **순서대로 80% 이상** 나타나고 5단어 이상일 때만 일치로 본다. 리포트 모델이 작은 단어를 빼고 인용하는 경우를 잡기 위함이다. 일부 단어만 공유하는 의역은 근거로 보지 않는다.
- 한계: 리포트 모델은 원문을 의역해 인용하는 경우가 많다. 샘플 시드로 한 실행에서 인용 블록 21개 중 6개(고유 인용 10개 중 3개)만 타임라인과 연결되었고, 나머지는 원문 단어가 50~60%만 포함된 의역이었다. 이는 백엔드 리포트 에이전트의 동작이라 이번 범위에서는 "Source not found"로 표시한다.

## 8. 가상 시뮬레이션 고지

- 모든 화면 상단에 "Simulated scenario — not real applicant data or a prediction" 배너를 고정한다.
- 리포트에는 "Qualitative results limited to this applicant set and this run."를 명시한다.
- 에이전트 수를 실제 지원자 모집단이나 통계 비율처럼 표현하지 않는다.
- 실행 전 확인 단계에서 시드 파일 이름과 요구사항 텍스트를 보여 주고, 결과가 그 시드에 좌우됨을 안내한다.

## 9. 검증

- 순수 함수는 `assert` 기반 자가검증 스크립트 하나로 확인한다(프레임워크 없음): `node src/lib/hiringSim.check.mjs`.
- 나머지는 백엔드(`.env`에 LLM·Zep 키 필요)와 프런트를 띄워 지원자 개인이 서술된 시드 파일로 끝까지 실행해 확인한다(저장소에 샘플 시드는 두지 않는다).

## 10. 범위 밖

- 두 정책의 병렬 실행·비교
- 실제 지원자 데이터, 합격률·이탈률 수치 예측
- 지원자 프로필을 사용자가 직접 선택·수정·추가하는 기능(수만 고를 수 있음)
- 백엔드 수정(단, 이 설계가 필요로 한 두 가지는 예외: 그래프 기록의 영어 문장, 지원자 생성 엔드포인트와 프로필 국가 고정)
- i18n
- 외부 사이트 게시·연동
