import assert from 'node:assert/strict'
import {
  validateScenario, validateFiles, pickApplicantTypes, buildSeedDoc, buildRequirement,
  parseReport, matchEvidence, buildFeed, pollUntil
} from './hiringSim.js'

const scenario = {
  role: 'Junior software engineer',
  policy: '4-hour unpaid coding assignment',
  details: 'Unpaid, evaluation criteria not disclosed',
  question: 'What concerns will come up?',
  context: ''
}
const profiles = [{ name: 'Minjun', title: 'First job search', description: 'Building a portfolio.', priorities: 'Time burden' }]

// validate
assert.equal(validateScenario({ role: '  ', policy: '', details: '', question: '' }).length, 4)
assert.deepEqual(validateScenario(scenario), [])
assert.equal(validateScenario({ ...scenario, role: ' ' })[0], 'Role / level is required.')

// seed doc / requirement
const doc = buildSeedDoc(scenario, profiles)
assert.ok(doc.includes('4-hour unpaid coding assignment') && doc.includes('Top priorities: Time burden'))
// each profile is one named individual, never a heading the graph could extract as an organization
assert.ok(doc.includes('Individual job seeker Minjun (pseudonym)') && doc.includes('Situation: First job search'))
assert.ok(!doc.includes('###'))
assert.ok(!doc.includes('Company / hiring context'))
assert.ok(buildSeedDoc({ ...scenario, context: 'A startup' }, profiles).includes('## Company / hiring context'))
const req = buildRequirement(scenario)
assert.ok(req.includes(scenario.question) && req.includes('Key summary') && req.includes('Improvements'))
assert.ok(req.includes('organizations or concepts such as the policy'))
// the applicant entity types must be recognizable by name so /prepare can be limited to them
assert.ok(req.includes("ending in 'JobSeeker'"))

// validateFiles: allowed extensions only, 50 MB total, no files is fine
assert.deepEqual(validateFiles([]), [])
assert.deepEqual(validateFiles([{ name: 'Posting.PDF', size: 1000 }, { name: 'a.md', size: 5 }, { name: 'b.markdown', size: 5 }, { name: 'c.txt', size: 5 }]), [])
assert.equal(validateFiles([{ name: 'posting.docx', size: 10 }]).length, 1)
assert.ok(validateFiles([{ name: 'posting.docx', size: 10 }])[0].includes('posting.docx'))
assert.equal(validateFiles([{ name: 'noextension', size: 10 }]).length, 1)
assert.equal(validateFiles([{ name: 'a.pdf', size: 30 * 1024 * 1024 }, { name: 'b.pdf', size: 30 * 1024 * 1024 }]).length, 1)

// pickApplicantTypes: only entity types ending in JobSeeker; undefined means "do not filter"
assert.deepEqual(
  pickApplicantTypes({ entity_types: [{ name: 'JobSeeker' }, { name: 'EvaluationCriteriaFocusedJobSeeker' }, { name: 'Company' }, { name: 'Person' }] }),
  ['JobSeeker', 'EvaluationCriteriaFocusedJobSeeker']
)
assert.equal(pickApplicantTypes({ entity_types: [{ name: 'Company' }, { name: 'Person' }] }), undefined)
assert.equal(pickApplicantTypes({ entity_types: [] }), undefined)
assert.equal(pickApplicantTypes(undefined), undefined)

// parseReport: block types, empty quotes dropped, ** stripped, raw HTML kept as plain text
const blocks = parseReport('# Title\n\nText **bold**\n>\n> "A quote that is long enough"\n- item\n<script>alert(1)</script>')
assert.deepEqual(blocks.map(b => b.type), ['heading', 'paragraph', 'quote', 'item', 'paragraph'])
assert.equal(blocks[1].text, 'Text bold')
assert.equal(blocks[4].text, '<script>alert(1)</script>')
assert.deepEqual(parseReport(''), [])

// matchEvidence
const items = [
  { key: 'p1', content: 'Four hours is too long. Even worse if it is unpaid' },
  { key: 'c2', content: 'If the criteria are not published it feels unfair' }
]
assert.equal(matchEvidence('"Four hours is too long" — Agent A', items), 'p1')
assert.equal(matchEvidence('"If the criteria are not published ... feels unfair"', items), 'c2')
assert.equal(matchEvidence('"An entirely unrelated remark made at length"', items), null)
assert.equal(matchEvidence('ok', items), null)
assert.equal(matchEvidence('', items), null)

// buildFeed
const posts = [
  { post_id: 2, user_id: 1, content: 'Second post' },
  { post_id: 1, user_id: 0, content: 'First post' },
  { post_id: 3, user_id: 2, content: '', quote_content: null }
]
const comments = [
  { comment_id: 1, post_id: 1, user_id: 1, content: 'I agree' },
  { comment_id: 2, post_id: 99, user_id: 2, content: 'Orphan comment' },
  { comment_id: 3, post_id: 2, user_id: 1, content: 'Replying to myself' }
]
const actions = [
  { action_type: 'CREATE_POST', agent_id: 0, agent_name: 'Kim', round_num: 1, action_args: { content: 'First post' } },
  { action_type: 'CREATE_COMMENT', agent_id: 1, agent_name: 'Lee', round_num: 2, action_args: { content: 'I agree' } },
  { action_type: 'LIKE_POST', agent_id: 1, agent_name: 'Lee', round_num: 2, action_args: {} }
]
const agents = [{ name: 'Minjun', profession: 'Junior developer' }, { name: 'Seoyeon', bio: 'Employed and preparing to switch jobs.' }]
const feed = buildFeed(posts, comments, actions, agents)
assert.deepEqual(feed.map(i => i.key), ['p1', 'p2', 'c2'])
assert.equal(feed[0].name, 'Minjun')
assert.equal(feed[0].label, 'Junior developer')
assert.equal(feed[0].round, 1)
assert.equal(feed[0].comments[0].name, 'Seoyeon')
assert.equal(feed[0].comments[0].label, 'Employed and preparing to switch jobs.')
assert.equal(feed[1].name, 'Seoyeon')
assert.equal(feed[1].round, null)
assert.equal(feed[2].name, 'Agent 2')
assert.equal(feed[2].orphan, true)
// actions are only written after a round ends, so names must come from the profile list when there are none yet
assert.equal(buildFeed(posts, comments, [], agents)[0].name, 'Minjun')
// a comment by the post's own author is kept, but flagged
assert.equal(feed[0].comments[0].selfReply, false)
assert.equal(feed[1].comments[0].selfReply, true)
assert.deepEqual(buildFeed([], [], [], []), [])

// pollUntil
let n = 0
assert.equal(await pollUntil(async () => ++n, { isDone: v => v >= 3, isFailed: () => false, intervalMs: 1 }), 3)
await assert.rejects(
  pollUntil(async () => 'x', { isDone: () => false, isFailed: () => 'failed hard', intervalMs: 1 }),
  /failed hard/
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
