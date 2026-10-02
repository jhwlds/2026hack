<template>
  <section>
    <h2>Simulation timeline</h2>
    <ol class="progress">
      <li v-for="(label, key) in STAGE_LABELS" :key="key" :class="stageClass(key)">{{ label }}</li>
    </ol>
    <div v-if="error" class="failbox" role="alert">
      <strong>{{ STAGE_LABELS[stage] || 'Loading the run' }} failed</strong>
      <p>{{ error }}</p>
      <button class="btn" @click="$emit('retry')">Retry</button>
    </div>
    <details v-if="agents.length" class="agents">
      <summary>{{ agents.length }} fictional agents were created for this run (they may not match the default applicants)</summary>
      <ul>
        <li v-for="(a, i) in agents" :key="i"><b>{{ a.name }}</b> — {{ a.profession || a.bio }}</li>
      </ul>
    </details>
    <ActionTimeline :timeline="timeline" :highlight-key="highlightKey" />
    <div v-if="stage === 'done'" class="actions">
      <button class="btn ghost" @click="$emit('restart')">Edit the policy and start a new experiment</button>
    </div>
  </section>
</template>

<script setup>
import { STAGE_LABELS } from '../../lib/hiringSim'
import ActionTimeline from './ActionTimeline.vue'

const props = defineProps({
  stage: { type: String, default: '' },
  error: { type: String, default: '' },
  agents: { type: Array, default: () => [] },
  timeline: { type: Array, default: () => [] },
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
