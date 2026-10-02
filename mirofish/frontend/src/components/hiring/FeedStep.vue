<template>
  <section>
    <h2>Simulation feed</h2>
    <ol class="progress">
      <li v-for="(label, key) in STAGE_LABELS" :key="key" :class="stageClass(key)">{{ label }}</li>
    </ol>
    <div v-if="error" class="failbox" role="alert">
      <strong>{{ STAGE_LABELS[stage] }} failed</strong>
      <p>{{ error }}</p>
      <button class="btn" @click="$emit('retry')">Retry</button>
    </div>
    <details v-if="agents.length" class="agents">
      <summary>{{ agents.length }} fictional agents were created for this run (they may not match the default applicants)</summary>
      <ul>
        <li v-for="(a, i) in agents" :key="i"><b>{{ a.name }}</b> — {{ a.profession || a.bio }}</li>
      </ul>
    </details>
    <p v-if="!feed.length" class="empty">No posts yet.</p>
    <article v-for="item in feed" :id="`feed-${item.key}`" :key="item.key" class="post" :class="{ hl: item.key === highlightKey }">
      <header>
        <b>{{ item.name }}</b>
        <span v-if="item.label" class="tag">{{ item.label }}</span>
        <span v-if="item.round != null" class="round">Round {{ item.round }}</span>
        <span v-if="item.orphan" class="round">(comment whose post was not found)</span>
      </header>
      <p>{{ item.content }}</p>
      <div v-for="c in item.comments" :id="`feed-${c.key}`" :key="c.key" class="comment" :class="{ hl: c.key === highlightKey, self: c.selfReply }">
        <header>
          <b>{{ c.name }}</b>
          <span v-if="c.label" class="tag">{{ c.label }}</span>
          <span v-if="c.round != null" class="round">Round {{ c.round }}</span>
          <span v-if="c.selfReply" class="round">(replying to their own post)</span>
        </header>
        <p>{{ c.content }}</p>
      </div>
    </article>
    <div v-if="stage === 'done'" class="actions">
      <button class="btn ghost" @click="$emit('restart')">Edit the policy and start a new experiment</button>
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
