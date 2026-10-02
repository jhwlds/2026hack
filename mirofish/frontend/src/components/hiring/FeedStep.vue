<template>
  <section>
    <h2>시뮬레이션 피드</h2>
    <ol class="progress">
      <li v-for="(label, key) in STAGE_LABELS" :key="key" :class="stageClass(key)">{{ label }}</li>
    </ol>
    <div v-if="error" class="failbox" role="alert">
      <strong>{{ STAGE_LABELS[stage] }} 단계 실패</strong>
      <p>{{ error }}</p>
      <button class="btn" @click="$emit('retry')">다시 시도</button>
    </div>
    <details v-if="agents.length" class="agents">
      <summary>이번 실행에 생성된 가상 에이전트 {{ agents.length }}개 (선택한 프로필과 일치하지 않을 수 있음)</summary>
      <ul>
        <li v-for="(a, i) in agents" :key="i"><b>{{ a.name }}</b> — {{ a.profession || a.bio }}</li>
      </ul>
    </details>
    <p v-if="!feed.length" class="empty">아직 게시글이 없습니다.</p>
    <article v-for="item in feed" :id="`feed-${item.key}`" :key="item.key" class="post" :class="{ hl: item.key === highlightKey }">
      <header>
        <b>{{ item.name }}</b>
        <span v-if="item.label" class="tag">{{ item.label }}</span>
        <span v-if="item.round != null" class="round">라운드 {{ item.round }}</span>
        <span v-if="item.orphan" class="round">(원글을 찾을 수 없는 댓글)</span>
      </header>
      <p>{{ item.content }}</p>
      <div v-for="c in item.comments" :id="`feed-${c.key}`" :key="c.key" class="comment" :class="{ hl: c.key === highlightKey }">
        <header>
          <b>{{ c.name }}</b>
          <span v-if="c.label" class="tag">{{ c.label }}</span>
          <span v-if="c.round != null" class="round">라운드 {{ c.round }}</span>
        </header>
        <p>{{ c.content }}</p>
      </div>
    </article>
    <div v-if="stage === 'done'" class="actions">
      <button class="btn ghost" @click="$emit('restart')">정책을 수정해 새 실험 시작</button>
    </div>
  </section>
</template>

<script setup>
import { STAGE_LABELS } from '../../lib/hiringSim'

const props = defineProps({
  stage: { type: String, default: '' },
  error: { type: String, default: '' },
  agents: { type: Array, default: () => [] },
  feed: { type: Array, default: () => [] },
  highlightKey: { type: String, default: '' }
})
defineEmits(['retry', 'restart'])

const keys = Object.keys(STAGE_LABELS)
const stageClass = (key) => {
  if (props.stage === 'done') return 'done'
  const idx = keys.indexOf(key)
  const cur = keys.indexOf(props.stage)
  if (idx < cur) return 'done'
  return idx === cur ? 'active' : ''
}
</script>
