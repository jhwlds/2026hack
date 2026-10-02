import assert from 'node:assert/strict'
import {
  validateInput, pickApplicantTypes, buildRequirement, runPhase,
  parseReport, matchEvidence, buildTimeline, evidenceItems, summarizeRun, pollUntil
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

// runPhase: the parallel runner keeps its process alive in a wait-for-commands mode after both platforms finish,
// so the run only reaches 'completed' once the environment is closed
assert.equal(runPhase({ runner_status: 'running', reddit_completed: false, twitter_completed: false }), 'running')
assert.equal(runPhase({ runner_status: 'running', reddit_completed: true, twitter_completed: false }), 'running')
assert.equal(runPhase({ runner_status: 'running', reddit_completed: true, twitter_completed: true }), 'closing')
assert.equal(runPhase({ runner_status: 'stopping', reddit_completed: true, twitter_completed: true }), 'stopping')
assert.equal(runPhase({ runner_status: 'completed' }), 'done')
assert.equal(runPhase({ runner_status: 'stopped' }), 'done')
assert.equal(runPhase({ runner_status: 'failed', error: 'boom' }), 'failed')
assert.equal(runPhase({ runner_status: 'idle' }), 'running')

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
// the report model often drops small words from a quote; the words must still appear in order in one post or comment
const dropped = [{ key: 'c7', content: 'Honestly the total time investment is simply too high for me right now' }]
assert.equal(matchEvidence('"the total time investment too high"', dropped), 'c7')
// a paraphrase that only shares some words is not evidence
assert.equal(matchEvidence('"time investment is the biggest problem for applicants"', dropped), null)
// words in the wrong order are not a quote
assert.equal(matchEvidence('"high too investment time total the"', dropped), null)
// too short to identify a source
assert.equal(matchEvidence('"too high"', dropped), null)
// the best-covered source wins when several share words
assert.equal(matchEvidence('"the total time investment is simply too high"', [{ key: 'x', content: 'the total time is a lot' }, ...dropped]), 'c7')
assert.equal(matchEvidence('ok', items), null)
assert.equal(matchEvidence('', items), null)

// buildTimeline: the original MiroFish action cards, in time order, joined with the DB rows that know who replied to whom
const actions = [
  { action_type: 'CREATE_COMMENT', agent_id: 1, agent_name: 'Lee', round_num: 2, platform: 'reddit', timestamp: '2026-10-02T14:03:07.4', action_args: { comment_id: '12', content: 'I agree' } },
  { action_type: 'CREATE_POST', agent_id: 0, agent_name: 'Kim', round_num: 1, platform: 'reddit', timestamp: '2026-10-02T14:03:05.5', action_args: { content: 'First post', post_id: '1' } },
  { action_type: 'LIKE_POST', agent_id: 1, agent_name: 'Lee', round_num: 2, platform: 'reddit', timestamp: '2026-10-02T14:03:08.0', action_args: {} },
  { action_type: 'QUOTE_POST', agent_id: 2, agent_name: 'Park', round_num: 2, platform: 'reddit', timestamp: '2026-10-02T14:03:09.0', action_args: { quote_content: 'Quoting this' } },
  { action_type: 'CREATE_COMMENT', agent_id: 0, agent_name: 'Kim', round_num: 2, platform: 'reddit', timestamp: '2026-10-02T14:03:10.0', action_args: { comment_id: '13', content: 'Replying to myself' } },
  { action_type: 'CREATE_COMMENT', agent_id: 2, agent_name: 'Park', round_num: 2, platform: 'reddit', timestamp: '2026-10-02T14:03:11.0', action_args: { comment_id: '99', content: 'No database row for me' } }
]
const db = {
  posts: [{ post_id: 1, user_id: 0, content: 'First post' }],
  comments: [
    { comment_id: 12, post_id: 1, user_id: 1, content: 'I agree' },
    { comment_id: 13, post_id: 1, user_id: 0, content: 'Replying to myself' }
  ],
  profiles: [{ name: 'Kim', profession: 'Junior developer' }, { name: 'Lee', bio: 'Employed and preparing to switch jobs.' }]
}
const timeline = buildTimeline(actions, db)
assert.deepEqual(timeline.map(t => t.action_type), ['CREATE_POST', 'CREATE_COMMENT', 'LIKE_POST', 'QUOTE_POST', 'CREATE_COMMENT', 'CREATE_COMMENT'])
assert.equal(new Set(timeline.map(t => t.key)).size, timeline.length)
assert.deepEqual(timeline.map(t => t.text), ['First post', 'I agree', '', 'Quoting this', 'Replying to myself', 'No database row for me'])
assert.equal(timeline[0].label, 'Junior developer')
assert.equal(timeline[1].label, 'Employed and preparing to switch jobs.')
assert.equal(timeline[3].label, '')
// comments are joined to their post through the database comment row
assert.equal(timeline[1].replyToName, 'Kim')
assert.equal(timeline[1].selfReply, false)
assert.equal(timeline[4].replyToName, 'Kim')
assert.equal(timeline[4].selfReply, true)
// no database row: the card still renders, without reply information
assert.equal(timeline[5].replyToName, undefined)
assert.equal(timeline[5].selfReply, false)
assert.deepEqual(buildTimeline([], { posts: [], comments: [], profiles: [] }), [])
assert.equal(actions[0].action_type, 'CREATE_COMMENT') // the input is not reordered in place

// evidenceItems: only cards with text can be evidence
assert.deepEqual(evidenceItems(timeline).map(e => e.content), ['First post', 'I agree', 'Quoting this', 'Replying to myself', 'No database row for me'])
assert.equal(evidenceItems(timeline)[0].key, timeline[0].key)

// summarizeRun: what a history card shows for one past simulation (fields of GET /simulation/history)
const run = {
  simulation_id: 'sim_1', project_id: 'proj_1', status: 'completed', created_at: '2026-10-02',
  simulation_requirement: 'What concerns will a 4-hour unpaid coding assignment cause?\nThe agents are the individual job seekers described in the seed document.',
  files: [{ filename: 'posting.pdf' }, { filename: 'notes.md' }], current_round: 2, total_rounds: 6, report_id: 'report_1'
}
const sum = summarizeRun(run)
assert.equal(sum.title, 'What concerns will a 4-hour unpaid coding assignment cause?') // only the user's own first line
assert.equal(sum.files, 'posting.pdf, notes.md')
assert.equal(sum.rounds, '2/6 rounds')
assert.equal(sum.hasReport, true)
assert.equal(sum.date, '2026-10-02')
assert.equal(summarizeRun({ ...run, created_at: '2026-10-02T13:14:22.911907' }).date, '2026-10-02') // the API sends a full timestamp
assert.equal(summarizeRun({ ...run, simulation_requirement: 'x'.repeat(200) }).title, 'x'.repeat(90) + '…')
assert.equal(summarizeRun({ simulation_id: 's' }).title, 'Untitled run')
assert.equal(summarizeRun({ simulation_id: 's' }).files, 'No files')
assert.equal(summarizeRun({ simulation_id: 's' }).rounds, 'No rounds yet')
assert.equal(summarizeRun({ simulation_id: 's', report_id: null }).hasReport, false)
assert.equal(summarizeRun({ simulation_id: 's', total_rounds: 0 }).rounds, 'No rounds yet')

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
