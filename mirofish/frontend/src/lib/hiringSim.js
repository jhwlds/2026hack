export const MAX_ROUNDS = 6
export const DISCLAIMER = 'Simulated scenario — not real applicant data or a prediction'
export const REPORT_SCOPE_NOTE = 'Qualitative results limited to this applicant set and this run.'
export const STAGE_LABELS = {
  ontology: 'Analyzing scenario',
  graph: 'Building graph',
  prepare: 'Creating agents',
  run: 'Running simulation',
  report: 'Generating report'
}

const ALLOWED_EXTENSIONS = ['pdf', 'md', 'txt', 'markdown'] // mirrors the backend's Config.ALLOWED_EXTENSIONS
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024 // mirrors the backend's MAX_CONTENT_LENGTH

export const DEMO_REQUIREMENT = 'What concerns and positive reactions will the 4-hour unpaid coding assignment create in the job seeker community?'

// The original MiroFish takes exactly two inputs: a world seed file and a requirement text.
export function validateInput(requirement, file) {
  const errors = []
  if (!file) errors.push('Upload a world seed file.')
  else if (!file.name.includes('.') || !ALLOWED_EXTENSIONS.includes(file.name.split('.').pop().toLowerCase())) {
    errors.push(`${file.name}: only PDF, MD, TXT and MARKDOWN files are supported.`)
  } else if (file.size > MAX_UPLOAD_BYTES) errors.push('The file is larger than 50 MB.')
  if (!String(requirement || '').trim()) errors.push('Describe what you want to simulate.')
  return errors
}

// Where a run is, from /run-status data. After both platforms finish, the parallel runner keeps its process alive
// waiting for interview commands, so the run stays "running" until the environment is closed: that is 'closing'.
export function runPhase(data) {
  if (data.runner_status === 'failed') return 'failed'
  if (['completed', 'stopped'].includes(data.runner_status)) return 'done'
  if (data.runner_status === 'stopping') return 'stopping'
  return data.reddit_completed && data.twitter_completed ? 'closing' : 'running'
}

// Applicant agents are the entities whose type name ends in "JobSeeker" (the requirement text asks for that naming).
// Returning undefined tells /prepare not to filter, which is the safe fallback when the model ignored the naming.
export function pickApplicantTypes(ontology) {
  const names = (ontology?.entity_types || []).map(t => t.name).filter(n => n.endsWith('JobSeeker'))
  return names.length ? names : undefined
}

// The user's text goes first; the fixed lines carry what this product needs from every run.
export function buildRequirement(text) {
  return [
    text.trim(),
    'The agents are the individual job seekers described in the seed document; organizations or concepts such as the policy, the company or the community are not agents.',
    "Name every entity type that represents an individual job seeker with a type name ending in 'JobSeeker' (for example JobSeeker), and give no other entity type such a name.",
    "Each job seeker posts an initial opinion after seeing the policy, then replies to, agrees with or pushes back on other job seekers' posts.",
    'Structure the report with these sections: Key summary; Recurring concerns and positive reactions; Points that strengthened or changed after other agents reacted; Where perspectives split; Improvements the company could consider.',
    'For every claim, attach a verbatim excerpt from the simulated conversation as a quote block (> "...").',
    'The results are a qualitative analysis of fictional agents and must not be presented as a real applicant population or as statistical proportions.'
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

const tokens = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ').split(/\s+/).filter(Boolean)

// Share of quote tokens found, in order, in the source tokens (a subsequence, so dropped small words are tolerated).
function orderedCoverage(quote, source) {
  let at = 0
  let found = 0
  for (const t of quote) {
    const i = source.indexOf(t, at)
    if (i !== -1) { found++; at = i + 1 }
  }
  return found / quote.length
}

const MIN_QUOTE_TOKENS = 5
const MIN_COVERAGE = 0.8

// Take the text inside the quotation marks of a quote block; if an ellipsis splits it, use the longest fragment.
// The report model often drops small words, so a quote matches the source whose words cover at least 80% of it in order;
// anything that only shares some words (a paraphrase) is deliberately not treated as evidence.
export function matchEvidence(quoteText, items) {
  const inner = String(quoteText || '').match(/["“「]([^"”」]{8,})["”」]/)
  const fragments = (inner ? inner[1] : String(quoteText || '')).split(/\.{3}|…/).map(tokens)
  const q = fragments.sort((a, b) => b.length - a.length)[0] || []
  if (q.length < MIN_QUOTE_TOKENS) return null
  let best = null
  let bestScore = MIN_COVERAGE
  for (const item of items) {
    const score = orderedCoverage(q, tokens(item.content))
    if (score >= bestScore && (!best || score > bestScore)) { best = item.key; bestScore = score }
  }
  return best
}

const actionKey = (a) => `${a.timestamp}-${a.platform}-${a.agent_id}-${a.action_type}`
const actionText = (a) => a.action_args?.content || a.action_args?.quote_content || ''

// Turns the /actions rows into the cards of the original simulation timeline, in time order (the server does not sort them).
// An action carries only a comment_id, so who a comment replied to comes from the database rows: comment -> post -> author.
export function buildTimeline(actions, { posts = [], comments = [], profiles = [] } = {}) {
  const commentById = new Map(comments.map(c => [String(c.comment_id), c]))
  const postById = new Map(posts.map(p => [String(p.post_id), p]))
  const labelOf = (p) => p?.profession || p?.bio?.slice(0, 40) || ''
  return [...actions]
    .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)))
    .map(a => {
      const item = { ...a, key: actionKey(a), text: a.action_type === 'LIKE_POST' ? '' : actionText(a), label: labelOf(profiles[a.agent_id]), selfReply: false }
      if (a.action_type === 'CREATE_COMMENT') {
        const row = commentById.get(String(a.action_args?.comment_id))
        const post = row && postById.get(String(row.post_id))
        if (post) {
          item.replyToName = profiles[post.user_id]?.name
          item.selfReply = post.user_id === row.user_id
        }
      }
      return item
    })
}

export const evidenceItems = (timeline) => timeline.filter(t => t.text).map(t => ({ key: t.key, content: t.text }))

class PollFailure extends Error {}

// A string returned from isFailed fails the poll with that message. Transient fetch errors are tolerated up to maxErrors in a row.
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
