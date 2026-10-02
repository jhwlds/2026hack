<template>
  <div class="sim">
    <header class="top">
      <span class="brand">Hiring Policy Reaction Simulator</span>
      <span class="steps">
        <span v-for="(s, i) in STEPS" :key="s.id" :class="{ on: step === s.id }">{{ i + 1 }}. {{ s.label }}</span>
      </span>
    </header>
    <div class="banner" role="note">{{ DISCLAIMER }}</div>
    <main>
      <ScenarioStep v-if="step === 'scenario'" :scenario="scenario" @next="step = 'review'" />
      <ReviewStep v-else-if="step === 'review'" :scenario="scenario" :profiles="DEFAULT_PROFILES" @back="step = 'scenario'" @start="start" />
      <div v-else class="run">
        <FeedStep
          :stage="stage" :error="error" :agents="agents" :feed="feed" :highlight-key="highlightKey"
          @retry="execute" @restart="restart"
        />
        <ReportStep v-if="markdown" :markdown="markdown" :feed="feed" @jump="jump" />
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import i18n from '../i18n'
import ScenarioStep from '../components/hiring/ScenarioStep.vue'
import ReviewStep from '../components/hiring/ReviewStep.vue'
import FeedStep from '../components/hiring/FeedStep.vue'
import ReportStep from '../components/hiring/ReportStep.vue'
import { runPipeline } from '../api/hiringSim'
import { getSimulationPosts, getSimulationComments, getSimulationActions, getSimulationProfiles } from '../api/simulation'
import { DISCLAIMER, buildFeed } from '../lib/hiringSim'
import { DEMO_SCENARIO, DEFAULT_PROFILES } from '../data/defaultProfiles'

const STEPS = [
  { id: 'scenario', label: 'Scenario' },
  { id: 'review', label: 'Review' },
  { id: 'run', label: 'Feed & report' }
]
const step = ref('scenario')
const scenario = reactive({ ...DEMO_SCENARIO })

const stage = ref('')
const error = ref('')
const markdown = ref('')
const feed = ref([])
const agents = ref([])
const highlightKey = ref('')

let pipeline = {} // resume state that runPipeline fills in
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
      scenario, profiles: DEFAULT_PROFILES, state: pipeline, signal: controller.signal, onStage
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

const jump = (key) => {
  highlightKey.value = key
  document.getElementById(`feed-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  setTimeout(() => { highlightKey.value = '' }, 2500)
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

// The backend answers in the language of the Accept-Language header (default zh); this page is English.
let previousLocale = ''
let previousTitle = ''
onMounted(() => {
  previousLocale = i18n.global.locale.value
  i18n.global.locale.value = 'en'
  previousTitle = document.title
  document.title = 'Hiring Policy Reaction Simulator'
})

onUnmounted(() => {
  i18n.global.locale.value = previousLocale || i18n.global.locale.value
  document.title = previousTitle || document.title
  controller?.abort()
  stopFeedPolling()
})
</script>

<style>
.sim { min-height: 100vh; display: flex; flex-direction: column; }
.sim .top { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 14px 24px; border-bottom: 2px solid #000; flex-wrap: wrap; }
.sim .brand { font-weight: 700; letter-spacing: 1px; }
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
