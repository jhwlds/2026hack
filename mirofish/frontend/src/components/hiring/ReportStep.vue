<template>
  <section class="report">
    <h2>Report</h2>
    <p class="scope">{{ REPORT_SCOPE_NOTE }} {{ DISCLAIMER }}</p>
    <template v-for="(b, i) in blocks" :key="i">
      <component :is="`h${Math.min(b.level + 2, 5)}`" v-if="b.type === 'heading'">{{ b.text }}</component>
      <blockquote v-else-if="b.type === 'quote'">
        {{ b.text }}
        <button v-if="b.key" class="link" @click="$emit('jump', b.key)">View source</button>
        <span v-else class="miss">Source not found</span>
      </blockquote>
      <p v-else>
        <template v-if="b.type === 'item'">• </template>{{ b.text }}
        <button v-for="k in b.sources" :key="k" class="link" @click="$emit('jump', k)">View source</button>
      </p>
    </template>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { parseReport, dedupeReport, matchEvidence, evidenceItems, REPORT_SCOPE_NOTE, DISCLAIMER } from '../../lib/hiringSim'

const props = defineProps({
  markdown: { type: String, default: '' },
  timeline: { type: Array, default: () => [] }
})
defineEmits(['jump'])

const evidence = computed(() => evidenceItems(props.timeline))
// A quote block links by its own text; a bullet or paragraph links once for each quoted passage that matches a card.
const blocks = computed(() => parseReport(dedupeReport(props.markdown)).map(b => {
  if (b.type === 'quote') return { ...b, key: matchEvidence(b.text, evidence.value) }
  if (!b.quotes) return b
  const keys = b.quotes.map(q => matchEvidence(`"${q}"`, evidence.value)).filter(Boolean)
  return { ...b, sources: [...new Set(keys)] }
}))
</script>
