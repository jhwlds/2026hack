<template>
  <section>
    <h2>1. 시나리오 작성</h2>
    <div class="card">
      <label class="field">직무/레벨
        <input v-model="scenario.role" placeholder="예) 신입 소프트웨어 엔지니어" />
      </label>
      <label class="field">채용 정책
        <input v-model="scenario.policy" placeholder="예) 4시간 코딩 과제" />
      </label>
      <label class="field">정책 세부사항
        <textarea v-model="scenario.details" placeholder="과제 시간, 보상 여부, 평가 기준 공개 여부 등" />
      </label>
      <label class="field">시뮬레이션 질문
        <textarea v-model="scenario.question" placeholder="예) 이 정책이 지원자 커뮤니티에서 어떤 우려와 긍정 반응을 만들까?" />
      </label>
      <label class="field">회사 또는 채용 배경 (선택)
        <textarea v-model="scenario.context" placeholder="짧은 배경 설명" />
      </label>
      <p class="scope">데모용 가상 정보만 입력하세요. 실제 개인정보나 민감한 채용 자료는 입력하지 않습니다.</p>
      <p v-for="e in errors" :key="e" class="err">{{ e }}</p>
    </div>
    <div class="actions">
      <button class="btn" @click="next">다음: 실행 전 확인</button>
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { validateScenario } from '../../lib/hiringSim'

const props = defineProps({ scenario: { type: Object, required: true } })
const emit = defineEmits(['next'])
const errors = ref([])

const next = () => {
  errors.value = validateScenario(props.scenario)
  if (!errors.value.length) emit('next')
}
</script>
