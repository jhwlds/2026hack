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

const SCENARIO_FIELDS = { role: 'Role / level', policy: 'Hiring policy', details: 'Policy details', question: 'Simulation question' }

export function validateScenario(scenario) {
  return Object.entries(SCENARIO_FIELDS)
    .filter(([key]) => !String(scenario[key] || '').trim())
    .map(([, label]) => `${label} is required.`)
}

export function buildSeedDoc(s, profiles) {
  const lines = [
    '# Hiring policy scenario (for a simulated community)', '',
    '## Role / level', s.role.trim(), '',
    '## Hiring policy', s.policy.trim(), '',
    '## Policy details', s.details.trim(), ''
  ]
  if (s.context?.trim()) lines.push('## Company / hiring context', s.context.trim(), '')
  lines.push('## Individual job seekers taking part in the discussion', 'The following are fictional individual job seekers discussing this policy.', '')
  // One named individual per profile, as a sentence rather than a heading, so the graph builder
  // extracts people instead of treating the profile title as an organization.
  for (const p of profiles) {
    lines.push(`- Individual job seeker ${p.name} (pseudonym). Situation: ${p.title}. ${p.description} Top priorities: ${p.priorities}`)
  }
  return lines.join('\n') + '\n'
}

export function buildRequirement(s) {
  return [
    `Simulate how a community of fictional job seekers reacts to and discusses this hiring policy: ${s.policy.trim()}.`,
    `Simulation question: ${s.question.trim()}`,
    'The agents are the individual job seekers described in the scenario document; organizations or concepts such as the policy, the company or the community are not agents.',
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

const norm = (s) => String(s || '').toLowerCase().replace(/[\s"'“”‘’`.,!?…\-—·()[\]「」]+/g, '')

// Take the text inside the quotation marks of a quote block; if an ellipsis splits it, use the longest fragment.
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

// DB rows carry no author name, so match each row's text against the CREATE_POST/CREATE_COMMENT actions to attach one.
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
      : { name: `Agent ${row.user_id}`, label: '', round: null }
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
