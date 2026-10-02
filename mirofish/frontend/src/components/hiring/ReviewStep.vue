<template>
  <section>
    <h2>3. 실행 전 확인</h2>
    <div class="card">
      <dl>
        <dt>직무/레벨</dt><dd>{{ scenario.role }}</dd>
        <dt>채용 정책</dt><dd>{{ scenario.policy }}</dd>
        <dt>정책 세부사항</dt><dd>{{ scenario.details }}</dd>
        <dt>시뮬레이션 질문</dt><dd>{{ scenario.question }}</dd>
        <template v-if="scenario.context"><dt>배경</dt><dd>{{ scenario.context }}</dd></template>
      </dl>
    </div>
    <p class="scope">참여하는 가상 지원자는 기본 구성이 자동 적용됩니다. 구직 상황과 제약만 기술하며, 특정 집단 전체를 대표하지 않습니다.</p>
    <div class="card">
      <dl>
        <template v-for="p in profiles" :key="p.id">
          <dt>{{ p.name }}(가명) · {{ p.title }}</dt>
          <dd>{{ p.description }}<br />우선순위: {{ p.priorities }}</dd>
        </template>
      </dl>
    </div>
    <p class="scope">
      결과는 위 프로필 구성에 한정된 가상 에이전트의 대화와 정성적 분석입니다. 토론은 최대 {{ MAX_ROUNDS }}라운드로 진행되며,
      실제 지원자 반응이나 정책의 인과적 효과로 해석하지 마세요. 실행에는 수 분이 걸릴 수 있습니다.
    </p>
    <div class="actions">
      <button class="btn ghost" @click="$emit('back')">이전</button>
      <button class="btn" @click="$emit('start')">시뮬레이션 실행</button>
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
