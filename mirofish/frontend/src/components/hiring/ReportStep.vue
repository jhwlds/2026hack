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
      <p v-else-if="b.type === 'item'">• {{ b.text }}</p>
      <p v-else>{{ b.text }}</p>
    </template>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { parseReport, matchEvidence, REPORT_SCOPE_NOTE, DISCLAIMER } from '../../lib/hiringSim'

const props = defineProps({
  markdown: { type: String, default: '' },
  feed: { type: Array, default: () => [] }
})
defineEmits(['jump'])

const evidence = computed(() => props.feed.flatMap(i => [i, ...i.comments]))
const blocks = computed(() => parseReport(props.markdown).map(b =>
  b.type === 'quote' ? { ...b, key: matchEvidence(b.text, evidence.value) } : b
))
</script>
