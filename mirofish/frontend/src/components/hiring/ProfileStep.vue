<template>
  <section>
    <h2>2. 지원자 구성</h2>
    <p class="scope">참여시킬 가상 지원자 유형을 고르고 내용을 수정하세요. 구직 상황과 제약만 기술하며, 특정 집단 전체를 대표하지 않습니다.</p>
    <div v-for="p in profiles" :key="p.id" class="card">
      <div class="profile-head">
        <input v-model="p.selected" type="checkbox" :aria-label="`${p.title || '새 프로필'} 포함`" />
        <input v-model="p.title" type="text" placeholder="프로필 이름" />
        <button v-if="p.custom" class="btn ghost" @click="remove(p.id)">삭제</button>
      </div>
      <label class="field">가명 (비워 두면 자동 부여)
        <input v-model="p.name" />
      </label>
      <label class="field">구직 상황
        <textarea v-model="p.description" />
      </label>
      <label class="field">핵심 우선순위
        <input v-model="p.priorities" />
      </label>
    </div>
    <button class="btn ghost" @click="add">+ 사용자 정의 프로필 추가</button>
    <p v-for="e in errors" :key="e" class="err">{{ e }}</p>
    <div class="actions">
      <button class="btn ghost" @click="$emit('back')">이전</button>
      <button class="btn" @click="next">다음: 실행 전 확인</button>
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { validateProfiles } from '../../lib/hiringSim'

const props = defineProps({ profiles: { type: Array, required: true } })
const emit = defineEmits(['back', 'next'])
const errors = ref([])

const add = () => props.profiles.push({
  id: `custom-${Date.now()}`, name: '', title: '', description: '', priorities: '', selected: true, custom: true
})
const remove = (id) => props.profiles.splice(props.profiles.findIndex(p => p.id === id), 1)
const next = () => {
  errors.value = validateProfiles(props.profiles.filter(p => p.selected))
  if (!errors.value.length) emit('next')
}
</script>
