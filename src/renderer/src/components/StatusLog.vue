<script setup lang="ts">
defineProps<{ logs: string[] }>()
</script>

<template>
  <section class="status-log">
    <div v-for="line in logs" :key="line">{{ line }}</div>
  </section>
</template>
