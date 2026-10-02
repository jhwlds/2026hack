<template>
  <section>
    <h2>2. Review before running</h2>
    <div class="card">
      <dl>
        <dt>Role / level</dt><dd>{{ scenario.role }}</dd>
        <dt>Hiring policy</dt><dd>{{ scenario.policy }}</dd>
        <dt>Policy details</dt><dd>{{ scenario.details }}</dd>
        <dt>Simulation question</dt><dd>{{ scenario.question }}</dd>
        <template v-if="scenario.context"><dt>Context</dt><dd>{{ scenario.context }}</dd></template>
      </dl>
    </div>
    <p class="scope">The fictional applicants below are applied automatically. They describe job-search situations and constraints only and do not represent any group.</p>
    <div class="card">
      <dl>
        <template v-for="p in profiles" :key="p.id">
          <dt>{{ p.name }} (pseudonym) · {{ p.title }}</dt>
          <dd>{{ p.description }}<br />Priorities: {{ p.priorities }}</dd>
        </template>
      </dl>
    </div>
    <p class="scope">
      Results are limited to this applicant set: a qualitative analysis of fictional agents' conversations. The discussion runs for up to
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

defineProps({
  scenario: { type: Object, required: true },
  profiles: { type: Array, required: true }
})
defineEmits(['back', 'start'])
</script>
