# 채용 정책 반응 시뮬레이터 페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `mirofish/frontend`에 `/hiring-sim` 페이지를 추가해, 채용 정책 입력 → 지원자 구성 → 실행 전 확인 → 시뮬레이션 피드 → 근거가 연결된 리포트까지 실제 MiroFish 백엔드로 끝까지 실행한다.

**Architecture:** 순수 로직(`src/lib/hiringSim.js`: 시드 문서 조립, 입력 검증, 피드 조립, 리포트 파싱, 인용 매칭, 폴링)은 node `assert` 스크립트로 검증한다. `src/api/hiringSim.js`가 기존 `api/graph.js`·`simulation.js`·`report.js`를 순서대로 호출하는 재개 가능한 파이프라인이다. UI는 `views/HiringSim.vue`(상태 보유)와 `components/hiring/*`(표시 전용) 5개로 나눈다. 백엔드는 수정하지 않는다.

**Tech Stack:** Vue 3 (`<script setup>`), vue-router 4, axios(기존 `api/index.js`), Vite 7. 테스트 프레임워크 없음 — node 내장 `assert`만 사용.

**Spec:** `docs/superpowers/specs/2026-10-02-hiring-sim-page-design.md`

## Global Constraints

- 라우트는 `/hiring-sim`, 이름은 `HiringSim`.
- 라운드 수 상수 `MAX_ROUNDS = 6`.
- 한국어 하드코딩, i18n 미적용.
- 모든 화면 상단 고정 배너 문구: `가상 시뮬레이션 — 실제 지원자 데이터나 예측이 아님`
- 리포트 고지 문구: `이 프로필 구성과 이번 실행에 한정된 정성적 결과입니다.`
- 백엔드(`mirofish/backend`) 수정 금지. 기존 `api/*.js`는 추가만 하고 기존 함수는 바꾸지 않는다.
- 스타일은 흑백·모노스페이스(기존 `App.vue` 전역 폰트·색을 따른다).
- 프로필은 구직 상황·시간 여유·경험·우선순위만 기술하고 인구통계 속성을 쓰지 않는다.
- 에이전트 수를 실제 지원자 모집단이나 통계 비율처럼 표현하지 않는다.
- 사용자 입력과 LLM 리포트 텍스트는 `v-html` 없이 `{{ }}`로만 렌더링한다.
- 피드 플랫폼은 `reddit` 단일(`enable_twitter: false`, `enable_reddit: true`, `platform: 'reddit'`).
- 커밋 메시지는 마침표로 끝나는 영어 문장이고, 마지막 줄에 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`을 붙인다.

## Review Focus

각 줄의 테스트는 해당 Task의 `hiringSim.check.mjs`에 들어 있다.

1. 필수 입력이 공백만 있거나 프로필이 0개인 채로 진행하려는 경우 → 진행 불가 (Task 1 `validateScenario`/`validateProfiles` 테스트).
2. 리포트에 인용문이 없거나 원문과 매칭되지 않는 경우 → 크래시 없이 "원문 미확인" (Task 1 `matchEvidence` null 테스트, `parseReport` 빈 인용 테스트).
3. 파이프라인 도중 실패·중단(페이지 이탈) → 폴링이 멈추고 에러 메시지가 전달됨 (Task 1 `pollUntil` 실패·abort·일시 오류 테스트).
4. 댓글이 존재하지 않는 글을 가리키거나 작성자 매칭에 실패한 경우 → 피드가 깨지지 않고 대체 표시 (Task 1 `buildFeed` 고아 댓글·작성자 미매칭 테스트).
5. 사용자가 입력한 `<script>` 같은 문자열 → 문서에는 텍스트로만 들어가고 화면에서는 이스케이프됨 (Task 1 `parseReport` 원문 보존 테스트 + Global Constraints의 `v-html` 금지).

---

### Task 1: 순수 로직, 기본 프로필, 자가검증 스크립트

**Files:**
- Create: `mirofish/frontend/src/lib/hiringSim.js`
- Create: `mirofish/frontend/src/lib/hiringSim.check.mjs`
- Create: `mirofish/frontend/src/data/defaultProfiles.js`
- Modify: `docs/superpowers/specs/2026-10-02-hiring-sim-page-design.md` (§3, §5, §6)

**Interfaces:**
- Produces (`src/lib/hiringSim.js`):
  - 상수 `MAX_ROUNDS`, `DISCLAIMER`, `REPORT_SCOPE_NOTE`, `STAGE_LABELS`(`{ ontology, graph, prepare, run, report }` → 한국어 라벨)
  - `validateScenario(scenario) → string[]`, `validateProfiles(profiles) → string[]`
  - `buildSeedDoc(scenario, profiles) → string`, `buildRequirement(scenario) → string`
  - `parseReport(markdown) → Block[]` (`{type:'heading',level,text}` | `{type:'quote'|'item'|'paragraph',text}`)
  - `matchEvidence(quoteText, items) → key | null` (`items: {key, content}[]`)
  - `buildFeed(posts, comments, actions, profiles) → FeedItem[]` (`{key, kind, content, name, label, round, comments[], orphan?}`)
  - `pollUntil(fn, {isDone, isFailed, intervalMs, signal, maxErrors}) → Promise<result>`
- Produces (`src/data/defaultProfiles.js`): `DEFAULT_PROFILES`(`{id,title,description,priorities}[]`), `DEMO_SCENARIO`(`{role,policy,details,question,context}`)

- [ ] **Step 1: 자가검증 스크립트 작성 (실패해야 함)**

`mirofish/frontend/src/lib/hiringSim.check.mjs`:

```js
import assert from 'node:assert/strict'
import {
  validateScenario, validateProfiles, buildSeedDoc, buildRequirement,
  parseReport, matchEvidence, buildFeed, pollUntil
} from './hiringSim.js'

const scenario = {
  role: '신입 소프트웨어 엔지니어',
  policy: '4시간 무급 코딩 과제',
  details: '무급, 평가 기준 비공개',
  question: '어떤 우려가 생길까?',
  context: ''
}
const profiles = [{ title: '첫 취업 준비', description: '포트폴리오를 쌓는 중', priorities: '시간 부담' }]

// validate
assert.equal(validateScenario({ role: '  ', policy: '', details: '', question: '' }).length, 4)
assert.deepEqual(validateScenario(scenario), [])
assert.equal(validateProfiles([]).length, 1)
assert.equal(validateProfiles([{ title: ' ', description: 'x', priorities: 'y' }]).length, 1)
assert.deepEqual(validateProfiles(profiles), [])

// seed doc / requirement
const doc = buildSeedDoc(scenario, profiles)
assert.ok(doc.includes('4시간 무급 코딩 과제') && doc.includes('### 첫 취업 준비') && doc.includes('핵심 우선순위: 시간 부담'))
assert.ok(!doc.includes('회사/채용 배경'))
assert.ok(buildSeedDoc({ ...scenario, context: '스타트업' }, profiles).includes('## 회사/채용 배경'))
const req = buildRequirement(scenario)
assert.ok(req.includes(scenario.question) && req.includes('핵심 요약') && req.includes('개선안'))

// parseReport: 구조, 빈 인용 제거, ** 제거, HTML은 원문 그대로 보존
const blocks = parseReport('# 제목\n\n본문 **강조**\n>\n> "인용 문장입니다 정말로"\n- 항목\n<script>alert(1)</script>')
assert.deepEqual(blocks.map(b => b.type), ['heading', 'paragraph', 'quote', 'item', 'paragraph'])
assert.equal(blocks[1].text, '본문 강조')
assert.equal(blocks[4].text, '<script>alert(1)</script>')
assert.deepEqual(parseReport(''), [])

// matchEvidence
const items = [
  { key: 'p1', content: '4시간은 너무 길어요. 무급이면 더 그렇죠' },
  { key: 'c2', content: '평가 기준이 공개되지 않으면 불공정하다고 느껴요' }
]
assert.equal(matchEvidence('"4시간은 너무 길어요" — 에이전트 A', items), 'p1')
assert.equal(matchEvidence('"평가 기준이 공개되지 않으면 ... 불공정"', items), 'c2')
assert.equal(matchEvidence('"전혀 관련 없는 이야기를 길게 합니다"', items), null)
assert.equal(matchEvidence('ok', items), null)
assert.equal(matchEvidence('', items), null)

// buildFeed
const posts = [
  { post_id: 2, user_id: 1, content: '두번째 글' },
  { post_id: 1, user_id: 0, content: '첫 글' },
  { post_id: 3, user_id: 2, content: '', quote_content: null }
]
const comments = [
  { comment_id: 1, post_id: 1, user_id: 1, content: '동의해요' },
  { comment_id: 2, post_id: 99, user_id: 2, content: '고아 댓글' }
]
const actions = [
  { action_type: 'CREATE_POST', agent_id: 0, agent_name: 'Kim', round_num: 1, action_args: { content: '첫 글' } },
  { action_type: 'CREATE_COMMENT', agent_id: 1, agent_name: 'Lee', round_num: 2, action_args: { content: '동의해요' } },
  { action_type: 'LIKE_POST', agent_id: 1, agent_name: 'Lee', round_num: 2, action_args: {} }
]
const agents = [{ profession: '신입 개발자' }, { bio: '이직 준비 중인 재직자입니다.' }]
const feed = buildFeed(posts, comments, actions, agents)
assert.deepEqual(feed.map(i => i.key), ['p1', 'p2', 'c2'])
assert.equal(feed[0].name, 'Kim')
assert.equal(feed[0].label, '신입 개발자')
assert.equal(feed[0].round, 1)
assert.equal(feed[0].comments[0].name, 'Lee')
assert.equal(feed[0].comments[0].label, '이직 준비 중인 재직자입니다.')
assert.equal(feed[1].name, '에이전트 1')
assert.equal(feed[2].orphan, true)
assert.deepEqual(buildFeed([], [], [], []), [])

// pollUntil
let n = 0
assert.equal(await pollUntil(async () => ++n, { isDone: v => v >= 3, isFailed: () => false, intervalMs: 1 }), 3)
await assert.rejects(
  pollUntil(async () => 'x', { isDone: () => false, isFailed: () => '실패함', intervalMs: 1 }),
  /실패함/
)
const ac = new AbortController()
ac.abort()
await assert.rejects(
  pollUntil(async () => 1, { isDone: () => false, isFailed: () => false, intervalMs: 1, signal: ac.signal }),
  /aborted/
)
let k = 0
assert.equal(
  await pollUntil(async () => { if (++k < 3) throw new Error('net'); return k }, { isDone: () => true, isFailed: () => false, intervalMs: 1 }),
  3
)
await assert.rejects(
  pollUntil(async () => { throw new Error('down') }, { isDone: () => true, isFailed: () => false, intervalMs: 1, maxErrors: 3 }),
  /down/
)

console.log('hiringSim checks ok')
```

- [ ] **Step 2: 실행해서 실패 확인**

Run: `cd mirofish/frontend && node src/lib/hiringSim.check.mjs`
Expected: FAIL — `Cannot find module .../hiringSim.js`

- [ ] **Step 3: 구현 작성**

`mirofish/frontend/src/lib/hiringSim.js`:

```js
export const MAX_ROUNDS = 6
export const DISCLAIMER = '가상 시뮬레이션 — 실제 지원자 데이터나 예측이 아님'
export const REPORT_SCOPE_NOTE = '이 프로필 구성과 이번 실행에 한정된 정성적 결과입니다.'
export const STAGE_LABELS = {
  ontology: '시나리오 분석',
  graph: '그래프 구축',
  prepare: '에이전트 생성',
  run: '시뮬레이션 실행',
  report: '리포트 생성'
}

const SCENARIO_FIELDS = { role: '직무/레벨', policy: '채용 정책', details: '정책 세부사항', question: '시뮬레이션 질문' }

export function validateScenario(scenario) {
  return Object.entries(SCENARIO_FIELDS)
    .filter(([key]) => !String(scenario[key] || '').trim())
    .map(([, label]) => `${label}을(를) 입력해 주세요.`)
}

export function validateProfiles(profiles) {
  if (!profiles.length) return ['지원자 프로필을 하나 이상 선택해 주세요.']
  return profiles.some(p => !p.title.trim() || !p.description.trim())
    ? ['선택한 프로필의 이름과 설명을 모두 입력해 주세요.']
    : []
}

export function buildSeedDoc(s, profiles) {
  const lines = [
    '# 채용 정책 시나리오 (가상 시뮬레이션용)', '',
    '## 직무/레벨', s.role.trim(), '',
    '## 채용 정책', s.policy.trim(), '',
    '## 정책 세부사항', s.details.trim(), ''
  ]
  if (s.context?.trim()) lines.push('## 회사/채용 배경', s.context.trim(), '')
  lines.push('## 구직자 커뮤니티 구성원', '다음은 이 정책에 대해 온라인 구직자 커뮤니티에서 토론하는 가상의 구직자들이다.', '')
  for (const p of profiles) {
    lines.push(`### ${p.title.trim()}`, p.description.trim(), `핵심 우선순위: ${p.priorities.trim()}`, '')
  }
  return lines.join('\n')
}

export function buildRequirement(s) {
  return [
    `가상의 구직자 커뮤니티에서 다음 채용 정책에 대한 반응과 토론을 시뮬레이션한다: ${s.policy.trim()}.`,
    `시뮬레이션 질문: ${s.question.trim()}`,
    '각 구직자는 정책을 보고 초기 의견을 게시한 뒤 다른 구직자의 글에 답하거나 동의·반박한다.',
    '리포트는 다음 섹션으로 구성한다: 핵심 요약, 반복해서 나온 우려와 긍정 반응, 다른 에이전트의 반응 이후 강화되거나 바뀐 논점, 관점이 갈린 부분, 회사가 검토할 만한 개선안.',
    '각 섹션의 주장마다 시뮬레이션 대화에서 가져온 원문 발췌를 인용 블록(> "...")으로 첨부한다.',
    '결과는 가상 에이전트의 정성적 분석이며 실제 지원자 모집단이나 통계 비율로 표현하지 않는다.'
  ].join('\n')
}

export function parseReport(markdown) {
  const blocks = []
  for (const raw of String(markdown || '').split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) continue
    const text = (t) => t.replace(/\*\*/g, '').trim()
    let m
    if ((m = line.match(/^(#{1,4})\s+(.+)$/))) blocks.push({ type: 'heading', level: m[1].length, text: text(m[2]) })
    else if ((m = line.match(/^>\s?(.*)$/))) { if (text(m[1])) blocks.push({ type: 'quote', text: text(m[1]) }) }
    else if ((m = line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/))) blocks.push({ type: 'item', text: text(m[1]) })
    else blocks.push({ type: 'paragraph', text: text(line) })
  }
  return blocks
}

const norm = (s) => String(s || '').toLowerCase().replace(/[\s"'“”‘’`.,!?…\-—·()[\]「」]+/g, '')

// 인용 블록에서 따옴표 안의 문장만 꺼내고, 줄임표로 나뉜 조각 중 가장 긴 것을 쓴다.
export function matchEvidence(quoteText, items) {
  const inner = String(quoteText || '').match(/["“「]([^"”」]{8,})["”」]/)
  const fragments = (inner ? inner[1] : String(quoteText || '')).split(/\.{3}|…/).map(norm)
  const q = fragments.sort((a, b) => b.length - a.length)[0] || ''
  if (q.length < 8) return null
  const hit = items.find(i => {
    const c = norm(i.content)
    return c.includes(q) || (c.length >= 8 && q.includes(c))
  })
  return hit ? hit.key : null
}

// DB 행에는 작성자 이름이 없어서, /actions의 CREATE_POST/CREATE_COMMENT 본문과 일치시켜 작성자를 붙인다.
export function buildFeed(posts, comments, actions = [], profiles = []) {
  const authors = new Map()
  for (const a of actions) {
    const content = a.action_args?.content
    if (content && (a.action_type === 'CREATE_POST' || a.action_type === 'CREATE_COMMENT')) {
      authors.set(norm(content), a)
    }
  }
  const labelOf = (agentId) => {
    const p = profiles[agentId]
    return p?.profession || p?.bio?.slice(0, 40) || ''
  }
  const authorOf = (row) => {
    const a = authors.get(norm(row.content))
    return a
      ? { name: a.agent_name, label: labelOf(a.agent_id), round: a.round_num }
      : { name: `에이전트 ${row.user_id}`, label: '', round: null }
  }

  const feed = []
  const byPostId = new Map()
  const byId = (key) => (x, y) => x[key] - y[key]
  for (const p of [...posts].sort(byId('post_id'))) {
    const content = p.content || p.quote_content || ''
    if (!content) continue
    const item = { key: `p${p.post_id}`, kind: 'post', content, ...authorOf({ ...p, content }), comments: [] }
    byPostId.set(p.post_id, item)
    feed.push(item)
  }
  for (const c of [...comments].sort(byId('comment_id'))) {
    const item = { key: `c${c.comment_id}`, kind: 'comment', content: c.content || '', ...authorOf(c), comments: [] }
    const parent = byPostId.get(c.post_id)
    if (parent) parent.comments.push(item)
    else feed.push({ ...item, orphan: true })
  }
  return feed
}

class PollFailure extends Error {}

// isFailed가 문자열을 돌려주면 그 메시지로 실패 처리한다. 일시적 네트워크 오류는 maxErrors번까지 견딘다.
export async function pollUntil(fn, { isDone, isFailed, intervalMs = 2000, signal, maxErrors = 5 }) {
  let errors = 0
  while (true) {
    if (signal?.aborted) throw new Error('aborted')
    try {
      const res = await fn()
      errors = 0
      const failure = isFailed(res)
      if (failure) throw new PollFailure(failure)
      if (isDone(res)) return res
    } catch (e) {
      if (e instanceof PollFailure) throw e
      if (++errors >= maxErrors) throw e
    }
    await new Promise(r => setTimeout(r, intervalMs))
  }
}
```

`mirofish/frontend/src/data/defaultProfiles.js`:

```js
export const DEFAULT_PROFILES = [
  {
    id: 'first-job',
    title: '첫 취업 준비',
    description: '첫 취업을 준비하며 포트폴리오를 쌓고 있다. 시간은 있지만 경험이 적어 모든 지원 기회가 중요하다.',
    priorities: '포트폴리오에 도움이 되는지, 결과 피드백 여부'
  },
  {
    id: 'working',
    title: '재직 중 이직 준비',
    description: '현재 일하면서 이직을 준비한다. 평일 저녁과 주말에만 시간을 낼 수 있다.',
    priorities: '시간 대비 효율, 일정 유연성'
  },
  {
    id: 'multi',
    title: '여러 회사 과제 병행',
    description: '여러 회사의 과제 전형을 동시에 진행 중이다. 회사마다 수 시간씩 요구되어 일정이 겹친다.',
    priorities: '총 소요 시간, 무급 노동에 대한 보상, 지원 우선순위 조정'
  },
  {
    id: 'criteria',
    title: '평가 기준 중시',
    description: '과제의 평가 기준과 예상 소요 시간을 중요하게 본다. 기준이 불명확하면 지원 여부를 다시 고민한다.',
    priorities: '평가 기준 공개, 소요 시간 명시, 결과 피드백'
  }
]

export const DEMO_SCENARIO = {
  role: '신입 소프트웨어 엔지니어',
  policy: '4시간 무급 코딩 과제',
  details: '과제 시간 4시간, 무급, 평가 기준은 비공개, 제출 후 개별 피드백 없음',
  question: '이 정책이 지원자 커뮤니티에서 어떤 우려와 긍정 반응을 만들까?',
  context: ''
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd mirofish/frontend && node src/lib/hiringSim.check.mjs`
Expected: `hiringSim checks ok`

(실패하면 어떤 `assert`가 깨졌는지 보고 해당 함수를 고친다. 테스트를 약하게 바꾸지 않는다.)

- [ ] **Step 5: spec 수정 반영**

`docs/superpowers/specs/2026-10-02-hiring-sim-page-design.md`에서 다음을 바꾼다.

- §3의 `api/hiringSim.js` 항목을 아래로 교체:
  `- \`lib/hiringSim.js\`: 순수 함수(\`buildSeedDoc\`, \`parseReport\`, \`matchEvidence\`, \`buildFeed\`, \`pollUntil\` 등). node로 직접 검증하려고 axios/i18n 의존성이 없는 별도 파일에 둔다.`
  `- \`api/hiringSim.js\`: 기존 \`api/graph.js\`, \`simulation.js\`, \`report.js\`를 순서대로 호출하고 폴링하는 재개 가능한 오케스트레이션.`
- §3 컴포넌트 목록에 `ReviewStep.vue`(실행 전 확인)를 추가.
- §5 끝에 추가: `리포트 완료 여부는 \`getReport\`를 폴링해 \`status\`로 판단한다(\`api/report.js\`의 \`getReportStatus\`는 백엔드 POST 라우트와 메서드가 달라 쓰지 않는다). 피드 플랫폼은 \`reddit\` 단일이다.`
- §6의 마지막 불릿(필드 미확인)을 아래로 교체:
  `- DB 행(\`post\`: post_id, user_id, content, created_at / \`comment\`: comment_id, post_id, user_id, content)에는 작성자 이름이 없어, \`/actions\`의 CREATE_POST·CREATE_COMMENT 본문과 일치시켜 작성자 이름·라운드를 붙이고, 라벨은 프로필의 \`profession\` 또는 \`bio\` 앞부분을 쓴다. OASIS 댓글은 글 아래 평평하게 달리며 대댓글 id가 없다. 이 가정은 Task 7에서 실제 실행으로 확인한다.`

- [ ] **Step 6: Commit**

```bash
git add mirofish/frontend/src/lib mirofish/frontend/src/data docs/superpowers/specs/2026-10-02-hiring-sim-page-design.md
git commit -m "$(cat <<'EOF'
Add pure hiring-sim logic with a self-check script and default profiles.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 파이프라인 오케스트레이션과 댓글 API

**Files:**
- Modify: `mirofish/frontend/src/api/simulation.js` (파일 끝에 함수 추가)
- Create: `mirofish/frontend/src/api/hiringSim.js`

**Interfaces:**
- Consumes (Task 1): `buildSeedDoc`, `buildRequirement`, `pollUntil`, `MAX_ROUNDS`
- Consumes (기존 API): `generateOntology(formData)`, `buildGraph({project_id})`, `getTaskStatus(taskId)`, `getProject(projectId)`, `createSimulation`, `prepareSimulation`, `getPrepareStatus`, `startSimulation`, `getRunStatus`, `generateReport`, `getReport`
- Produces: `getSimulationComments(simulationId, platform, limit, offset)`, `runPipeline({scenario, profiles, state, signal, onStage}) → Promise<{markdown}>`
  - `state`는 호출자가 `{}`로 만들어 계속 넘기는 객체이며 `projectId`, `graphId`, `simulationId`, `prepared`, `started`, `reportId`를 채운다. 실패 후 같은 `state`로 다시 호출하면 끝난 단계는 건너뛴다.
  - `onStage(stageKey)`는 단계 시작 때 `await`로 호출된다(`STAGE_LABELS`의 키).

- [ ] **Step 1: 댓글 API 추가**

`mirofish/frontend/src/api/simulation.js` 파일 끝에 추가:

```js

/**
 * 获取模拟中的评论
 * @param {string} simulationId
 * @param {string} [platform] - 'reddit' | 'twitter'（省略时由后端根据模拟配置自动选择）
 * @param {number} limit - 返回数量
 * @param {number} offset - 偏移量
 */
export const getSimulationComments = (simulationId, platform, limit = 500, offset = 0) => {
  const params = { limit, offset }
  if (platform) params.platform = platform
  return service.get(`/api/simulation/${simulationId}/comments`, { params })
}
```

- [ ] **Step 2: 오케스트레이션 작성**

`mirofish/frontend/src/api/hiringSim.js`:

```js
import { generateOntology, buildGraph, getTaskStatus, getProject } from './graph'
import {
  createSimulation, prepareSimulation, getPrepareStatus, startSimulation, getRunStatus
} from './simulation'
import { generateReport, getReport } from './report'
import { buildSeedDoc, buildRequirement, pollUntil, MAX_ROUNDS } from '../lib/hiringSim'

const taskFailed = (r) => r.data.status === 'failed' && (r.data.error || r.data.message || '작업이 실패했습니다.')

// state를 채워 가며 진행하므로, 실패 뒤 같은 state로 다시 부르면 끝난 단계는 건너뛴다.
export async function runPipeline({ scenario, profiles, state, signal, onStage }) {
  const poll = (fn, isDone, isFailed, intervalMs = 2000) => pollUntil(fn, { isDone, isFailed, intervalMs, signal })

  if (!state.projectId) {
    await onStage('ontology')
    const form = new FormData()
    form.append('files', new Blob([buildSeedDoc(scenario, profiles)], { type: 'text/markdown' }), 'scenario.md')
    form.append('simulation_requirement', buildRequirement(scenario))
    form.append('project_name', `hiring-sim: ${scenario.policy.trim().slice(0, 30)}`)
    state.projectId = (await generateOntology(form)).data.project_id
  }

  if (!state.graphId) {
    await onStage('graph')
    const build = await buildGraph({ project_id: state.projectId })
    await poll(() => getTaskStatus(build.data.task_id), r => r.data.status === 'completed', taskFailed)
    state.graphId = (await getProject(state.projectId)).data.graph_id
  }

  if (!state.prepared) {
    await onStage('prepare')
    state.simulationId ||= (await createSimulation({
      project_id: state.projectId,
      graph_id: state.graphId,
      enable_twitter: false,
      enable_reddit: true
    })).data.simulation_id
    const prep = await prepareSimulation({
      simulation_id: state.simulationId,
      use_llm_for_profiles: true,
      parallel_profile_count: 5
    })
    if (!prep.data.already_prepared) {
      await poll(
        () => getPrepareStatus({ task_id: prep.data.task_id, simulation_id: state.simulationId }),
        r => ['completed', 'ready'].includes(r.data.status),
        taskFailed
      )
    }
    state.prepared = true
  }

  await onStage('run')
  try {
    if (!state.started) {
      await startSimulation({
        simulation_id: state.simulationId,
        platform: 'reddit',
        max_rounds: MAX_ROUNDS,
        force: true,
        enable_graph_memory_update: true
      })
      state.started = true
    }
    await poll(
      () => getRunStatus(state.simulationId),
      r => ['completed', 'stopped'].includes(r.data.runner_status),
      r => r.data.runner_status === 'failed' && (r.data.error || '시뮬레이션이 실패했습니다.'),
      3000
    )
  } catch (e) {
    state.started = false // 재시도 때 force로 다시 시작
    throw e
  }

  await onStage('report')
  try {
    state.reportId ||= (await generateReport({ simulation_id: state.simulationId })).data.report_id
    const done = await poll(
      () => getReport(state.reportId),
      r => r.data.status === 'completed',
      r => r.data.status === 'failed' && (r.data.error || '리포트 생성이 실패했습니다.'),
      3000
    )
    return { markdown: done.data.markdown_content }
  } catch (e) {
    state.reportId = null // 재시도 때 리포트를 새로 생성
    throw e
  }
}
```

- [ ] **Step 3: 빌드로 import 오류 확인**

Run: `cd mirofish/frontend && npm run build`
Expected: 빌드 성공 (`✓ built in ...`). 이 파일은 아직 어디서도 import되지 않아 트리셰이킹될 수 있으므로, 문법 오류만 잡는 확인이다. 실제 호출 검증은 Task 7에서 한다.

- [ ] **Step 4: Commit**

```bash
git add mirofish/frontend/src/api
git commit -m "$(cat <<'EOF'
Add a resumable hiring-sim pipeline over the existing MiroFish APIs.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 라우트, 페이지 셸, 시나리오 단계

**Files:**
- Modify: `mirofish/frontend/src/router/index.js`
- Create: `mirofish/frontend/src/views/HiringSim.vue`
- Create: `mirofish/frontend/src/components/hiring/ScenarioStep.vue`

> 이 Task는 셸과 시나리오 단계만 만든다. `ProfileStep`·`ReviewStep`·`FeedStep`·`ReportStep`의 import와 템플릿 연결은 Task 4~6에서 각 컴포넌트를 만들 때 `HiringSim.vue`에 추가한다. 아래 `<style>`에는 이후 Task의 클래스까지 미리 들어 있다.

**Interfaces:**
- Consumes (Task 1): `DISCLAIMER`, `validateScenario`, `DEMO_SCENARIO`, `DEFAULT_PROFILES`
- Produces: `ScenarioStep` — props `scenario`(reactive 객체, 입력 시 직접 수정), emits `next`

- [ ] **Step 1: 라우트 추가**

`mirofish/frontend/src/router/index.js`에서 import 줄 추가:

```js
import HiringSim from '../views/HiringSim.vue'
```

`routes` 배열 마지막 항목(`Interaction`) 뒤에 추가:

```js
  {
    path: '/hiring-sim',
    name: 'HiringSim',
    component: HiringSim
  }
```

(앞 항목 끝에 쉼표를 붙인다.)

- [ ] **Step 2: 페이지 셸 작성 (시나리오 단계만 연결)**

`mirofish/frontend/src/views/HiringSim.vue`:

```vue
<template>
  <div class="sim">
    <header class="top">
      <span class="brand" @click="router.push('/')">MIROFISH · 채용 정책 반응 시뮬레이터</span>
      <span class="steps">
        <span v-for="(s, i) in STEPS" :key="s.id" :class="{ on: step === s.id }">{{ i + 1 }}. {{ s.label }}</span>
      </span>
    </header>
    <div class="banner" role="note">{{ DISCLAIMER }}</div>
    <main>
      <ScenarioStep v-if="step === 'scenario'" :scenario="scenario" @next="step = 'profiles'" />
    </main>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import ScenarioStep from '../components/hiring/ScenarioStep.vue'
import { DISCLAIMER } from '../lib/hiringSim'
import { DEMO_SCENARIO } from '../data/defaultProfiles'

const router = useRouter()
const STEPS = [
  { id: 'scenario', label: '시나리오' },
  { id: 'profiles', label: '지원자 구성' },
  { id: 'review', label: '실행 전 확인' },
  { id: 'run', label: '피드·리포트' }
]
const step = ref('scenario')
const scenario = reactive({ ...DEMO_SCENARIO })
</script>

<style>
.sim { min-height: 100vh; display: flex; flex-direction: column; }
.sim .top { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 14px 24px; border-bottom: 2px solid #000; flex-wrap: wrap; }
.sim .brand { font-weight: 700; letter-spacing: 1px; cursor: pointer; }
.sim .steps { display: flex; gap: 16px; font-size: 13px; color: #888; flex-wrap: wrap; }
.sim .steps .on { color: #000; font-weight: 700; border-bottom: 2px solid #000; }
.sim .banner { position: sticky; top: 0; z-index: 10; background: #000; color: #fff; padding: 8px 24px; font-size: 13px; text-align: center; }
.sim main { width: 100%; max-width: 1200px; margin: 0 auto; padding: 24px; }
.sim h2 { font-size: 18px; margin-bottom: 16px; }
.sim .card { border: 2px solid #000; padding: 16px; margin-bottom: 16px; }
.sim .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; font-size: 13px; font-weight: 700; }
.sim .field input, .sim .field textarea { font: inherit; font-weight: 400; border: 1px solid #000; padding: 8px; background: #fff; }
.sim .field textarea { min-height: 72px; resize: vertical; }
.sim .actions { display: flex; gap: 12px; margin-top: 16px; }
.sim .btn { font: inherit; border: 2px solid #000; background: #000; color: #fff; padding: 10px 18px; cursor: pointer; }
.sim .btn.ghost { background: #fff; color: #000; }
.sim .err { color: #b00020; font-size: 13px; margin-top: 8px; }
.sim .progress { display: flex; gap: 8px; list-style: none; margin-bottom: 16px; flex-wrap: wrap; }
.sim .progress li { border: 1px solid #000; padding: 6px 10px; font-size: 12px; color: #888; }
.sim .progress li.done { background: #000; color: #fff; }
.sim .progress li.active { border-width: 3px; color: #000; font-weight: 700; }
.sim .failbox { border: 2px solid #b00020; padding: 12px; margin-bottom: 16px; }
.sim .agents { border: 1px solid #000; padding: 10px; margin-bottom: 16px; font-size: 13px; }
.sim .agents li { margin: 4px 0 4px 18px; }
.sim .run { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start; }
@media (max-width: 900px) { .sim .run { grid-template-columns: 1fr; } }
.sim .post { border: 1px solid #000; padding: 10px; margin-bottom: 12px; font-size: 13px; }
.sim .post.hl, .sim .comment.hl { outline: 3px solid #000; background: #f1f1f1; }
.sim .post header, .sim .comment header { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; margin-bottom: 4px; }
.sim .tag { border: 1px solid #000; padding: 0 6px; font-size: 11px; }
.sim .round { color: #888; font-size: 11px; }
.sim .comment { border-left: 3px solid #000; margin: 8px 0 0 14px; padding: 6px 10px; }
.sim .empty { color: #888; font-size: 13px; }
.sim .scope { font-size: 12px; color: #555; margin-bottom: 12px; }
.sim .report h3, .sim .report h4, .sim .report h5 { margin: 16px 0 6px; }
.sim .report p { font-size: 13px; line-height: 1.6; margin-bottom: 6px; }
.sim .report blockquote { border-left: 4px solid #000; background: #f6f6f6; padding: 8px 12px; margin: 6px 0; font-size: 13px; }
.sim .report .link, .sim .report .miss { margin-left: 8px; font-size: 11px; }
.sim .report .link { font: inherit; font-size: 11px; border: 1px solid #000; background: #fff; cursor: pointer; padding: 0 6px; }
.sim .report .miss { color: #888; }
.sim .profile-head { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; }
.sim .profile-head input[type='text'] { flex: 1; font: inherit; border: 1px solid #000; padding: 6px; }
.sim dl { font-size: 13px; }
.sim dt { font-weight: 700; margin-top: 10px; }
.sim dd { margin: 2px 0 0; white-space: pre-wrap; }
</style>
```

- [ ] **Step 3: 시나리오 단계 작성**

`mirofish/frontend/src/components/hiring/ScenarioStep.vue`:

```vue
<template>
  <section>
    <h2>1. 시나리오 작성</h2>
    <div class="card">
      <label class="field">직무/레벨
        <input v-model="scenario.role" placeholder="예) 신입 소프트웨어 엔지니어" />
      </label>
      <label class="field">채용 정책
        <input v-model="scenario.policy" placeholder="예) 4시간 코딩 과제" />
      </label>
      <label class="field">정책 세부사항
        <textarea v-model="scenario.details" placeholder="과제 시간, 보상 여부, 평가 기준 공개 여부 등" />
      </label>
      <label class="field">시뮬레이션 질문
        <textarea v-model="scenario.question" placeholder="예) 이 정책이 지원자 커뮤니티에서 어떤 우려와 긍정 반응을 만들까?" />
      </label>
      <label class="field">회사 또는 채용 배경 (선택)
        <textarea v-model="scenario.context" placeholder="짧은 배경 설명" />
      </label>
      <p class="scope">데모용 가상 정보만 입력하세요. 실제 개인정보나 민감한 채용 자료는 입력하지 않습니다.</p>
      <p v-for="e in errors" :key="e" class="err">{{ e }}</p>
    </div>
    <div class="actions">
      <button class="btn" @click="next">다음: 지원자 구성</button>
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { validateScenario } from '../../lib/hiringSim'

const props = defineProps({ scenario: { type: Object, required: true } })
const emit = defineEmits(['next'])
const errors = ref([])

const next = () => {
  errors.value = validateScenario(props.scenario)
  if (!errors.value.length) emit('next')
}
</script>
```

- [ ] **Step 4: 빌드 확인**

Run: `cd mirofish/frontend && npm run build`
Expected: 빌드 성공.

- [ ] **Step 5: 화면 확인 (백엔드 불필요)**

Run: `cd mirofish/frontend && npm run dev` 후 `http://localhost:3000/hiring-sim` 접속.
Expected: 상단 고정 검정 배너에 `가상 시뮬레이션 — 실제 지원자 데이터나 예측이 아님`, 데모 값이 채워진 폼. 직무를 지우고 "다음"을 누르면 `직무/레벨을(를) 입력해 주세요.` 표시. 확인 후 dev 서버를 종료한다.

- [ ] **Step 6: Commit**

```bash
git add mirofish/frontend/src/router mirofish/frontend/src/views/HiringSim.vue mirofish/frontend/src/components/hiring/ScenarioStep.vue
git commit -m "$(cat <<'EOF'
Add the hiring-sim route with the page shell and scenario step.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 지원자 구성과 실행 전 확인 단계

**Files:**
- Create: `mirofish/frontend/src/components/hiring/ProfileStep.vue`
- Create: `mirofish/frontend/src/components/hiring/ReviewStep.vue`
- Modify: `mirofish/frontend/src/views/HiringSim.vue`

**Interfaces:**
- Consumes (Task 1): `validateProfiles`, `DEFAULT_PROFILES`, `MAX_ROUNDS`
- Produces:
  - `ProfileStep` — props `profiles`(`{id,title,description,priorities,selected,custom}[]`, 직접 수정), emits `back`, `next`
  - `ReviewStep` — props `scenario`, `profiles`(선택된 프로필만), emits `back`, `start`
  - `HiringSim.vue`에 `profiles`(ref), `selectedProfiles`(computed) 추가

- [ ] **Step 1: 프로필 단계 작성**

`mirofish/frontend/src/components/hiring/ProfileStep.vue`:

```vue
<template>
  <section>
    <h2>2. 지원자 구성</h2>
    <p class="scope">참여시킬 가상 지원자 유형을 고르고 내용을 수정하세요. 구직 상황과 제약만 기술하며, 특정 집단 전체를 대표하지 않습니다.</p>
    <div v-for="p in profiles" :key="p.id" class="card">
      <div class="profile-head">
        <input v-model="p.selected" type="checkbox" :aria-label="`${p.title || '새 프로필'} 포함`" />
        <input v-model="p.title" type="text" placeholder="프로필 이름" />
        <button v-if="p.custom" class="btn ghost" @click="remove(p.id)">삭제</button>
      </div>
      <label class="field">구직 상황
        <textarea v-model="p.description" />
      </label>
      <label class="field">핵심 우선순위
        <input v-model="p.priorities" />
      </label>
    </div>
    <button class="btn ghost" @click="add">+ 사용자 정의 프로필 추가</button>
    <p v-for="e in errors" :key="e" class="err">{{ e }}</p>
    <div class="actions">
      <button class="btn ghost" @click="$emit('back')">이전</button>
      <button class="btn" @click="next">다음: 실행 전 확인</button>
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { validateProfiles } from '../../lib/hiringSim'

const props = defineProps({ profiles: { type: Array, required: true } })
const emit = defineEmits(['back', 'next'])
const errors = ref([])

const add = () => props.profiles.push({
  id: `custom-${Date.now()}`, title: '', description: '', priorities: '', selected: true, custom: true
})
const remove = (id) => props.profiles.splice(props.profiles.findIndex(p => p.id === id), 1)
const next = () => {
  errors.value = validateProfiles(props.profiles.filter(p => p.selected))
  if (!errors.value.length) emit('next')
}
</script>
```

- [ ] **Step 2: 실행 전 확인 단계 작성**

`mirofish/frontend/src/components/hiring/ReviewStep.vue`:

```vue
<template>
  <section>
    <h2>3. 실행 전 확인</h2>
    <div class="card">
      <dl>
        <dt>직무/레벨</dt><dd>{{ scenario.role }}</dd>
        <dt>채용 정책</dt><dd>{{ scenario.policy }}</dd>
        <dt>정책 세부사항</dt><dd>{{ scenario.details }}</dd>
        <dt>시뮬레이션 질문</dt><dd>{{ scenario.question }}</dd>
        <template v-if="scenario.context"><dt>배경</dt><dd>{{ scenario.context }}</dd></template>
      </dl>
    </div>
    <div class="card">
      <dl>
        <template v-for="p in profiles" :key="p.id">
          <dt>{{ p.title }}</dt>
          <dd>{{ p.description }}<br />우선순위: {{ p.priorities }}</dd>
        </template>
      </dl>
    </div>
    <p class="scope">
      결과는 위 프로필 구성에 한정된 가상 에이전트의 대화와 정성적 분석입니다. 토론은 최대 {{ MAX_ROUNDS }}라운드로 진행되며,
      실제 지원자 반응이나 정책의 인과적 효과로 해석하지 마세요. 실행에는 수 분이 걸릴 수 있습니다.
    </p>
    <div class="actions">
      <button class="btn ghost" @click="$emit('back')">이전</button>
      <button class="btn" @click="$emit('start')">시뮬레이션 실행</button>
    </div>
  </section>
</template>

<script setup>
import { MAX_ROUNDS } from '../../lib/hiringSim'

defineProps({
  scenario: { type: Object, required: true },
  profiles: { type: Array, required: true }
})
defineEmits(['back', 'start'])
</script>
```

- [ ] **Step 3: `HiringSim.vue`에 연결**

`<template>`의 `<main>` 안, `ScenarioStep` 줄 아래에 추가:

```vue
      <ProfileStep v-else-if="step === 'profiles'" :profiles="profiles" @back="step = 'scenario'" @next="step = 'review'" />
      <ReviewStep v-else-if="step === 'review'" :scenario="scenario" :profiles="selectedProfiles" @back="step = 'profiles'" @start="start" />
```

`<script setup>`을 아래로 교체(기존 내용 + 추가분):

```js
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import ScenarioStep from '../components/hiring/ScenarioStep.vue'
import ProfileStep from '../components/hiring/ProfileStep.vue'
import ReviewStep from '../components/hiring/ReviewStep.vue'
import { DISCLAIMER } from '../lib/hiringSim'
import { DEMO_SCENARIO, DEFAULT_PROFILES } from '../data/defaultProfiles'

const router = useRouter()
const STEPS = [
  { id: 'scenario', label: '시나리오' },
  { id: 'profiles', label: '지원자 구성' },
  { id: 'review', label: '실행 전 확인' },
  { id: 'run', label: '피드·리포트' }
]
const step = ref('scenario')
const scenario = reactive({ ...DEMO_SCENARIO })
const profiles = ref(DEFAULT_PROFILES.map(p => ({ ...p, selected: true, custom: false })))
const selectedProfiles = computed(() => profiles.value.filter(p => p.selected))

const start = () => {
  step.value = 'run' // Task 5에서 파이프라인 실행으로 교체
}
```

- [ ] **Step 4: 빌드 확인**

Run: `cd mirofish/frontend && npm run build`
Expected: 빌드 성공.

- [ ] **Step 5: 화면 확인 (백엔드 불필요)**

Run: `npm run dev` → `/hiring-sim`에서 "다음" → 프로필 4개가 모두 체크된 상태로 보임. 전부 체크 해제 후 "다음" → `지원자 프로필을 하나 이상 선택해 주세요.` 표시. 하나 체크하고 "다음" → 실행 전 확인에서 입력값과 선택한 프로필, 한계 문구가 보임. "사용자 정의 프로필 추가" 후 이름만 비우고 체크한 채 "다음" → `선택한 프로필의 이름과 설명을…` 에러. 확인 후 서버 종료.

- [ ] **Step 6: Commit**

```bash
git add mirofish/frontend/src/components/hiring mirofish/frontend/src/views/HiringSim.vue
git commit -m "$(cat <<'EOF'
Add the applicant profile and pre-run review steps.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 피드 단계와 파이프라인 실행 연결

**Files:**
- Create: `mirofish/frontend/src/components/hiring/FeedStep.vue`
- Modify: `mirofish/frontend/src/views/HiringSim.vue`

**Interfaces:**
- Consumes (Task 1): `buildFeed`, `STAGE_LABELS`
- Consumes (Task 2): `runPipeline`, `getSimulationComments`
- Consumes (기존): `getSimulationPosts(simId, platform, limit, offset)`, `getSimulationActions(simId, params)`, `getSimulationProfiles(simId, platform)`
- Produces: `FeedStep` — props `stage`(string), `error`(string), `agents`(array), `feed`(FeedItem[]), `highlightKey`(string), emits `retry`, `restart`
- `HiringSim.vue`에 상태 `stage`, `error`, `markdown`, `feed`, `agents`, `highlightKey`와 함수 `start`, `execute`, `restart` 추가

- [ ] **Step 1: 피드 단계 작성**

`mirofish/frontend/src/components/hiring/FeedStep.vue`:

```vue
<template>
  <section>
    <h2>시뮬레이션 피드</h2>
    <ol class="progress">
      <li v-for="(label, key) in STAGE_LABELS" :key="key" :class="stageClass(key)">{{ label }}</li>
    </ol>
    <div v-if="error" class="failbox" role="alert">
      <strong>{{ STAGE_LABELS[stage] }} 단계 실패</strong>
      <p>{{ error }}</p>
      <button class="btn" @click="$emit('retry')">다시 시도</button>
    </div>
    <details v-if="agents.length" class="agents">
      <summary>이번 실행에 생성된 가상 에이전트 {{ agents.length }}개 (선택한 프로필과 일치하지 않을 수 있음)</summary>
      <ul>
        <li v-for="(a, i) in agents" :key="i"><b>{{ a.name }}</b> — {{ a.profession || a.bio }}</li>
      </ul>
    </details>
    <p v-if="!feed.length" class="empty">아직 게시글이 없습니다.</p>
    <article v-for="item in feed" :id="`feed-${item.key}`" :key="item.key" class="post" :class="{ hl: item.key === highlightKey }">
      <header>
        <b>{{ item.name }}</b>
        <span v-if="item.label" class="tag">{{ item.label }}</span>
        <span v-if="item.round != null" class="round">라운드 {{ item.round }}</span>
        <span v-if="item.orphan" class="round">(원글을 찾을 수 없는 댓글)</span>
      </header>
      <p>{{ item.content }}</p>
      <div v-for="c in item.comments" :id="`feed-${c.key}`" :key="c.key" class="comment" :class="{ hl: c.key === highlightKey }">
        <header>
          <b>{{ c.name }}</b>
          <span v-if="c.label" class="tag">{{ c.label }}</span>
          <span v-if="c.round != null" class="round">라운드 {{ c.round }}</span>
        </header>
        <p>{{ c.content }}</p>
      </div>
    </article>
    <div v-if="stage === 'done'" class="actions">
      <button class="btn ghost" @click="$emit('restart')">정책을 수정해 새 실험 시작</button>
    </div>
  </section>
</template>

<script setup>
import { STAGE_LABELS } from '../../lib/hiringSim'

const props = defineProps({
  stage: { type: String, default: '' },
  error: { type: String, default: '' },
  agents: { type: Array, default: () => [] },
  feed: { type: Array, default: () => [] },
  highlightKey: { type: String, default: '' }
})
defineEmits(['retry', 'restart'])

const keys = Object.keys(STAGE_LABELS)
const stageClass = (key) => {
  if (props.stage === 'done') return 'done'
  const idx = keys.indexOf(key)
  const cur = keys.indexOf(props.stage)
  if (idx < cur) return 'done'
  return idx === cur ? 'active' : ''
}
</script>
```

- [ ] **Step 2: `HiringSim.vue`에 실행 로직 연결**

`<template>`의 `<main>` 안, `ReviewStep` 줄 아래에 추가:

```vue
      <div v-else class="run">
        <FeedStep
          :stage="stage" :error="error" :agents="agents" :feed="feed" :highlight-key="highlightKey"
          @retry="execute" @restart="restart"
        />
      </div>
```

`<script setup>`의 import에 추가:

```js
import { ref, reactive, computed, onUnmounted } from 'vue'
import FeedStep from '../components/hiring/FeedStep.vue'
import { runPipeline } from '../api/hiringSim'
import { getSimulationPosts, getSimulationComments, getSimulationActions, getSimulationProfiles } from '../api/simulation'
import { buildFeed } from '../lib/hiringSim'
```

(Task 4의 `import { ref, reactive, computed } from 'vue'`는 위의 `onUnmounted`가 추가된 줄로 바꾸고, `import { DISCLAIMER } from '../lib/hiringSim'`과 위의 `import { buildFeed } ...`는 `import { DISCLAIMER, buildFeed } from '../lib/hiringSim'` 한 줄로 합친다.)

기존 `start` 함수를 지우고 아래로 교체:

```js
const stage = ref('')
const error = ref('')
const markdown = ref('')
const feed = ref([])
const agents = ref([])
const highlightKey = ref('')

let pipeline = {} // runPipeline이 채우는 재개용 상태
let controller = null
let feedTimer = null

const refreshFeed = async () => {
  const id = pipeline.simulationId
  if (!id) return
  const [posts, comments, actions] = await Promise.all([
    getSimulationPosts(id, 'reddit', 200, 0),
    getSimulationComments(id, 'reddit', 500, 0),
    getSimulationActions(id, { platform: 'reddit', limit: 1000 })
  ])
  feed.value = buildFeed(posts.data.posts, comments.data.comments, actions.data.actions, agents.value)
}
const stopFeedPolling = () => clearInterval(feedTimer)
const startFeedPolling = () => {
  stopFeedPolling()
  refreshFeed().catch(() => {})
  feedTimer = setInterval(() => refreshFeed().catch(() => {}), 3000)
}

const onStage = async (s) => {
  stage.value = s
  if (s === 'run') {
    agents.value = await getSimulationProfiles(pipeline.simulationId, 'reddit').then(r => r.data.profiles).catch(() => [])
    startFeedPolling()
  }
}

const execute = async () => {
  error.value = ''
  controller = new AbortController()
  try {
    const out = await runPipeline({
      scenario, profiles: selectedProfiles.value, state: pipeline, signal: controller.signal, onStage
    })
    await refreshFeed()
    markdown.value = out.markdown
    stage.value = 'done'
  } catch (e) {
    if (!controller.signal.aborted) error.value = e.message
  } finally {
    stopFeedPolling()
  }
}

const start = () => {
  step.value = 'run'
  return execute()
}

const restart = () => {
  pipeline = {}
  stage.value = ''
  error.value = ''
  markdown.value = ''
  feed.value = []
  agents.value = []
  step.value = 'scenario'
}

onUnmounted(() => {
  controller?.abort()
  stopFeedPolling()
})
```

- [ ] **Step 3: 빌드 확인**

Run: `cd mirofish/frontend && npm run build`
Expected: 빌드 성공.

- [ ] **Step 4: 실패 경로 화면 확인 (백엔드 꺼진 상태)**

Run: `npm run dev` (백엔드는 띄우지 않는다) → `/hiring-sim`에서 끝까지 진행해 "시뮬레이션 실행".
Expected: 진행 표시줄의 `시나리오 분석`이 강조된 채, 빨간 박스에 `시나리오 분석 단계 실패`와 네트워크 에러 메시지, "다시 시도" 버튼. 서버 종료.

- [ ] **Step 5: Commit**

```bash
git add mirofish/frontend/src/components/hiring/FeedStep.vue mirofish/frontend/src/views/HiringSim.vue
git commit -m "$(cat <<'EOF'
Run the pipeline from the page and render the simulation feed.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 리포트 단계와 근거 링크

**Files:**
- Create: `mirofish/frontend/src/components/hiring/ReportStep.vue`
- Modify: `mirofish/frontend/src/views/HiringSim.vue`

**Interfaces:**
- Consumes (Task 1): `parseReport`, `matchEvidence`, `REPORT_SCOPE_NOTE`, `DISCLAIMER`
- Produces: `ReportStep` — props `markdown`(string), `feed`(FeedItem[]), emits `jump(key)`
- `HiringSim.vue`에 `jump(key)` 추가

- [ ] **Step 1: 리포트 단계 작성**

`mirofish/frontend/src/components/hiring/ReportStep.vue`:

```vue
<template>
  <section class="report">
    <h2>리포트</h2>
    <p class="scope">{{ REPORT_SCOPE_NOTE }} {{ DISCLAIMER }}</p>
    <template v-for="(b, i) in blocks" :key="i">
      <component :is="`h${Math.min(b.level + 2, 5)}`" v-if="b.type === 'heading'">{{ b.text }}</component>
      <blockquote v-else-if="b.type === 'quote'">
        {{ b.text }}
        <button v-if="b.key" class="link" @click="$emit('jump', b.key)">원문 보기</button>
        <span v-else class="miss">원문 미확인</span>
      </blockquote>
      <p v-else-if="b.type === 'item'">• {{ b.text }}</p>
      <p v-else>{{ b.text }}</p>
    </template>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { parseReport, matchEvidence, REPORT_SCOPE_NOTE, DISCLAIMER } from '../../lib/hiringSim'

const props = defineProps({
  markdown: { type: String, default: '' },
  feed: { type: Array, default: () => [] }
})
defineEmits(['jump'])

const evidence = computed(() => props.feed.flatMap(i => [i, ...i.comments]))
const blocks = computed(() => parseReport(props.markdown).map(b =>
  b.type === 'quote' ? { ...b, key: matchEvidence(b.text, evidence.value) } : b
))
</script>
```

- [ ] **Step 2: `HiringSim.vue`에 연결**

`<template>`의 `.run` div 안, `FeedStep` 닫는 태그 뒤에 추가:

```vue
        <ReportStep v-if="markdown" :markdown="markdown" :feed="feed" @jump="jump" />
```

`<script setup>` import에 추가:

```js
import ReportStep from '../components/hiring/ReportStep.vue'
```

`restart` 함수 위에 추가:

```js
const jump = (key) => {
  highlightKey.value = key
  document.getElementById(`feed-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  setTimeout(() => { highlightKey.value = '' }, 2500)
}
```

- [ ] **Step 3: 빌드 확인**

Run: `cd mirofish/frontend && npm run build` 와 `node src/lib/hiringSim.check.mjs`
Expected: 빌드 성공, `hiringSim checks ok`.

- [ ] **Step 4: Commit**

```bash
git add mirofish/frontend/src/components/hiring/ReportStep.vue mirofish/frontend/src/views/HiringSim.vue
git commit -m "$(cat <<'EOF'
Render the report with quotes linked back to feed posts.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 실제 백엔드로 end-to-end 실행 및 가정 확인

**Files:**
- Modify (필요 시): `mirofish/frontend/src/lib/hiringSim.js`, `mirofish/frontend/src/lib/hiringSim.check.mjs`, `mirofish/frontend/src/api/hiringSim.js`

**Interfaces:** 없음 (검증 Task).

사전 조건: `mirofish/.env`에 `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL_NAME`, `ZEP_API_KEY`가 채워져 있어야 한다(값은 출력하지 않는다). 비어 있으면 사용자에게 채워 달라고 요청하고 멈춘다.

- [ ] **Step 1: 백엔드와 프런트 실행**

터미널 1: `cd mirofish/backend && uv run python run.py` (포트 5001)
터미널 2: `cd mirofish/frontend && npm run dev` (포트 3000)
Expected: 백엔드 로그에 서버 시작, 프런트가 3000에서 응답.

- [ ] **Step 2: 데모 시나리오 실행**

브라우저에서 `http://localhost:3000/hiring-sim` → 기본값 그대로 끝까지 진행해 "시뮬레이션 실행".
Expected: 진행 표시줄이 `시나리오 분석 → 그래프 구축 → 에이전트 생성 → 시뮬레이션 실행 → 리포트 생성` 순으로 넘어가고, 실행 중 피드에 글과 댓글이 쌓인다. 완료 후 오른쪽에 리포트가 나타난다. 단계마다 실패하면 실패 단계와 메시지를 기록한다.

- [ ] **Step 3: 피드 가정 확인**

실행이 끝난 `simulation_id`를 백엔드 로그나 브라우저 네트워크 탭에서 확인해 아래를 실행:

```bash
SIM=<simulation_id>
curl -s "localhost:5001/api/simulation/$SIM/posts?platform=reddit&limit=3" | head -c 800
curl -s "localhost:5001/api/simulation/$SIM/comments?platform=reddit&limit=3" | head -c 800
curl -s "localhost:5001/api/simulation/$SIM/actions?platform=reddit&limit=3" | head -c 1200
curl -s "localhost:5001/api/simulation/$SIM/profiles?platform=reddit" | head -c 800
```

Expected (Task 1의 가정):
- posts 행에 `post_id`, `user_id`, `content`가 있다.
- comments 행에 `comment_id`, `post_id`, `user_id`, `content`가 있다.
- actions에 `agent_id`, `agent_name`, `round_num`, `action_type`이 있고 CREATE_POST/CREATE_COMMENT의 `action_args.content`가 DB 본문과 같다.
- profiles 배열의 인덱스가 `agent_id`와 대응하고 `profession` 또는 `bio`가 있다.

화면에서 확인: 댓글이 원글 아래에 붙는다, 작성자 이름이 `에이전트 N`이 아니라 실제 이름이다, 라벨이 보인다.

어긋나는 경우의 대응(어긋난 사실을 먼저 `hiringSim.check.mjs`의 fixture에 반영해 실패시키고, `buildFeed`를 고쳐 통과시킨다):
- `action_args.content`가 없고 다른 키(예: `post_content`)에 본문이 있으면 `buildFeed`의 `content` 추출을 그 키로 바꾼다.
- 본문이 같아도 작성자가 매칭되지 않으면(공백·줄바꿈 차이 등) `norm`을 확인한다.
- profiles 인덱스가 `agent_id`와 다르면 `labelOf`를 `profiles.find(p => p.user_id === agentId || p.username === ...)`처럼 실제 키로 바꾼다.

- [ ] **Step 4: 리포트 근거 링크 확인**

리포트에서 인용 블록 중 "원문 보기"가 붙은 비율을 눈으로 확인한다. "원문 보기"를 누르면 피드의 해당 글이 강조되고 스크롤되어야 한다. 대부분이 "원문 미확인"이면 리포트의 실제 인용 형식(따옴표 종류, 요약 여부)을 보고 `matchEvidence`의 `extractQuote` 정규식과 fixture를 맞춘다. LLM이 원문을 다르게 요약해 매칭이 안 되는 항목이 일부 남는 것은 spec §7의 알려진 한계다.

- [ ] **Step 5: 백엔드 미지원 가능성 확인**

`enable_twitter: false`로 `/prepare`나 `/start`가 거부되면(에러 메시지가 실패 박스에 표시된다), `src/api/hiringSim.js`의 `createSimulation` 호출을 `enable_twitter: true`로 바꾸고 `startSimulation`의 `platform: 'reddit'`은 유지한다. 피드 조회는 이미 `platform='reddit'`을 쓰므로 그대로 동작한다. 이 경우 spec §5의 "reddit 단일" 문구를 "reddit 피드만 사용"으로 고친다.

- [ ] **Step 6: 재시도 경로 확인**

시뮬레이션 실행 중 백엔드를 중지(터미널 1에서 Ctrl+C)한다.
Expected: 일시 오류를 몇 번 견딘 뒤 `시뮬레이션 실행 단계 실패` 박스가 뜬다. 백엔드를 다시 띄우고 "다시 시도"를 누르면 시나리오 분석·그래프·에이전트 단계를 다시 하지 않고 `시뮬레이션 실행` 단계부터 이어진다.

- [ ] **Step 7: 최종 검증과 Commit**

Run: `cd mirofish/frontend && node src/lib/hiringSim.check.mjs && npm run build`
Expected: `hiringSim checks ok`, 빌드 성공.

수정한 파일이 있을 때만:

```bash
git add mirofish/frontend/src docs/superpowers/specs/2026-10-02-hiring-sim-page-design.md
git commit -m "$(cat <<'EOF'
Fix hiring-sim feed and evidence matching against real backend output.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

수정이 없으면 커밋하지 않고, 어떤 가정이 실제와 일치했는지 결과를 사용자에게 보고한다.
