<template>
  <section>
    <h2>2. Review before running</h2>
    <div class="card">
      <dl>
        <dt>World seed file</dt><dd>{{ state.file.name }}</dd>
        <dt>Simulation requirement</dt><dd>{{ state.requirement }}</dd>
        <dt>Job seekers</dt><dd>{{ state.applicantCount }}</dd>
      </dl>
    </div>
    <p class="scope">
      The agents are individual job seekers: {{ state.applicantCount }} fictional ones, each with a persona, are generated from your seed file and question when you run, plus any described in the file.
      Results are a qualitative analysis of fictional agents' conversations, shaped by that seed. The discussion runs for up to
      {{ MAX_ROUNDS }} rounds. Do not read it as real applicant behavior or as a causal effect of the policy. A run can take several minutes.
    </p>
    <div class="actions">
      <button class="btn ghost" @click="$emit('back')">Back</button>
      <button class="btn" @click="$emit('start')">Run simulation</button>
    </div>
  </section>
</template>

<script setup>
import { MAX_ROUNDS } from '../../lib/hiringSim'

defineProps({ state: { type: Object, required: true } })
defineEmits(['back', 'start'])
</script>
