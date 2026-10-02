<template>
  <section>
    <h2>1. Provide the seed and the question</h2>
    <div class="card">
      <div class="field">World seed file
        <input type="file" accept=".pdf,.md,.txt,.markdown" @change="pick" />
        <span v-if="file" class="scope">{{ file.name }} ({{ Math.ceil(file.size / 1024) }} KB)</span>
        <span class="scope">
          A job posting or company description (PDF, MD, TXT). The entities in this file become the simulated world,
          so include the job seekers who will take part, as individual people.
        </span>
      </div>
      <label class="field">Simulation requirement
        <textarea v-model="state.requirement" placeholder="What do you want to find out? e.g. What concerns will a 4-hour unpaid coding assignment cause?" />
      </label>
      <p class="scope">Use fictional demo information only. Do not enter real personal data or sensitive hiring materials.</p>
      <p v-for="e in errors" :key="e" class="err">{{ e }}</p>
    </div>
    <div class="actions">
      <button class="btn" @click="next">Next: review before running</button>
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { validateInput } from '../../lib/hiringSim'

// state = { requirement: string, file: File | null }, owned by the page
const props = defineProps({ state: { type: Object, required: true } })
const emit = defineEmits(['next'])
const file = ref(props.state.file)
const errors = ref([])

const pick = (e) => {
  file.value = props.state.file = e.target.files[0] || null
}
const next = () => {
  errors.value = validateInput(props.state.requirement, props.state.file)
  if (!errors.value.length) emit('next')
}
</script>
