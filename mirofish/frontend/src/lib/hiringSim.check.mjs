import assert from 'node:assert/strict'
import {
  validateInput, pickApplicantTypes, buildRequirement,
  parseReport, matchEvidence, buildFeed, pollUntil
} from './hiringSim.js'

// validateInput: one world seed file (pdf/md/txt/markdown, up to 50 MB) and one requirement text
const seed = { name: 'Posting.PDF', size: 1000 }
assert.deepEqual(validateInput('What concerns will come up?', seed), [])
assert.deepEqual(validateInput('ok', { name: 'a.md', size: 5 }), [])
assert.deepEqual(validateInput('ok', { name: 'b.markdown', size: 5 }), [])
assert.deepEqual(validateInput('ok', { name: 'c.txt', size: 5 }), [])
assert.deepEqual(validateInput('ok', null), ['Upload a world seed file.'])
assert.deepEqual(validateInput('  ', seed), ['Describe what you want to simulate.'])
assert.equal(validateInput('', null).length, 2)
assert.equal(validateInput('ok', { name: 'posting.docx', size: 10 }).length, 1)
assert.ok(validateInput('ok', { name: 'posting.docx', size: 10 })[0].includes('posting.docx'))
assert.equal(validateInput('ok', { name: 'noextension', size: 10 }).length, 1)
assert.equal(validateInput('ok', { name: 'a.pdf', size: 51 * 1024 * 1024 }).length, 1)

// buildRequirement: the user's own text comes first and is trimmed, then the fixed product instructions
const req = buildRequirement('  What concerns will a 4-hour unpaid assignment cause?  ')
assert.ok(req.startsWith('What concerns will a 4-hour unpaid assignment cause?\n'))
assert.ok(req.includes('Key summary') && req.includes('Improvements'))
assert.ok(req.includes('organizations or concepts such as the policy'))
// the applicant entity types must be recognizable by name so /prepare can be limited to them
assert.ok(req.includes("ending in 'JobSeeker'"))
assert.ok(req.includes('verbatim excerpt'))

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
