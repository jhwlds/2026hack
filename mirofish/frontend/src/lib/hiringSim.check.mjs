import assert from 'node:assert/strict'
import {
  validateScenario, buildSeedDoc, buildRequirement,
  parseReport, matchEvidence, buildFeed, pollUntil
} from './hiringSim.js'

const scenario = {
  role: '신입 소프트웨어 엔지니어',
  policy: '4시간 무급 코딩 과제',
  details: '무급, 평가 기준 비공개',
  question: '어떤 우려가 생길까?',
  context: ''
}
const profiles = [{ name: '민준', title: '첫 취업 준비', description: '포트폴리오를 쌓는 중', priorities: '시간 부담' }]

// validate
assert.equal(validateScenario({ role: '  ', policy: '', details: '', question: '' }).length, 4)
assert.deepEqual(validateScenario(scenario), [])

// seed doc / requirement
const doc = buildSeedDoc(scenario, profiles)
assert.ok(doc.includes('4시간 무급 코딩 과제') && doc.includes('핵심 우선순위: 시간 부담'))
// each profile is one named individual, never a heading the graph could extract as an organization
assert.ok(doc.includes('개인 구직자 민준(가명)') && doc.includes('상황 유형: 첫 취업 준비'))
assert.ok(!doc.includes('###'))
assert.ok(!doc.includes('회사/채용 배경'))
assert.ok(buildSeedDoc({ ...scenario, context: '스타트업' }, profiles).includes('## 회사/채용 배경'))
const req = buildRequirement(scenario)
assert.ok(req.includes(scenario.question) && req.includes('핵심 요약') && req.includes('개선안'))
assert.ok(req.includes('조직이나 개념은 에이전트가 아니다'))

// parseReport: block types, empty quotes dropped, ** stripped, raw HTML kept as plain text
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
