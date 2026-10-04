<template>
  <section v-if="runs.length" class="history">
    <h2>Past runs</h2>
    <button v-for="r in runs" :key="r.simulation_id" class="card run-card" @click="open(r.simulation_id)">
      <b>{{ r.summary.title }}</b>
      <span class="scope">{{ r.summary.files }}</span>
      <span class="run-meta">
        <span class="tag">{{ r.summary.rounds }}</span>
        <span class="tag">{{ r.summary.hasReport ? 'Report ready' : 'No report' }}</span>
        <span class="round">{{ r.summary.date }}</span>
      </span>
    </button>
  </section>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getSimulationHistory } from '../../api/simulation'
import { summarizeRun } from '../../lib/hiringSim'

const router = useRouter()
const runs = ref([])

const open = (simulationId) => router.push({ name: 'HiringSim', params: { simulationId } })

// The history list is a convenience; if it cannot load, the page works without it.
onMounted(async () => {
  try {
    const res = await getSimulationHistory(20)
    runs.value = (res.data || []).map(r => ({ ...r, summary: summarizeRun(r) }))
  } catch (e) {
    console.warn('History load failed:', e.message)
  }
})
</script>
