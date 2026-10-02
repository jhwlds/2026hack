<template>
  <section>
    <h2>1. Write the scenario</h2>
    <div class="card">
      <label class="field">Role / level
        <input v-model="scenario.role" placeholder="e.g. Junior software engineer" />
      </label>
      <label class="field">Hiring policy
        <input v-model="scenario.policy" placeholder="e.g. 4-hour coding assignment" />
      </label>
      <label class="field">Policy details
        <textarea v-model="scenario.details" placeholder="Assignment length, compensation, whether evaluation criteria are disclosed, etc." />
      </label>
      <label class="field">Simulation question
        <textarea v-model="scenario.question" placeholder="e.g. What concerns and positive reactions will this policy create in the job seeker community?" />
      </label>
      <label class="field">Company or hiring context (optional)
        <textarea v-model="scenario.context" placeholder="A short background" />
      </label>
      <div class="field">Company context files (optional)
        <input type="file" multiple accept=".pdf,.md,.txt,.markdown" @change="pick" />
        <ul v-if="files.length" class="files">
          <li v-for="(f, i) in files" :key="f.name + i">{{ f.name }} <button class="btn ghost" @click="files.splice(i, 1)">Remove</button></li>
        </ul>
        <span class="scope">A job posting or company description (PDF, MD, TXT). It becomes part of the simulated world, so the discussion refers to your company.</span>
      </div>
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
import { validateScenario, validateFiles } from '../../lib/hiringSim'

const props = defineProps({
  scenario: { type: Object, required: true },
  files: { type: Array, required: true }
})
const emit = defineEmits(['next'])
const errors = ref([])

const pick = (e) => {
  props.files.push(...e.target.files)
  e.target.value = '' // allow picking the same file again after removing it
}
const next = () => {
  errors.value = [...validateScenario(props.scenario), ...validateFiles(props.files)]
  if (!errors.value.length) emit('next')
}
</script>
