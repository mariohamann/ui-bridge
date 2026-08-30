<script setup lang="ts">
const features = [
  { icon: '⚡', title: 'Instant previews', description: 'Live browser updates.' },
  { icon: '🎨', title: 'Design tokens', description: 'Sync colours from design.' },
  { icon: '🔗', title: 'Component linking', description: 'Map Figma to source.' },
];
</script>

<template>
  <section>
    <article v-for="feature in features" :key="feature.title" class="feature-card">
      <span class="feature-icon">{{ feature.icon }}</span>
      <h3>{{ feature.title }}</h3>
    </article>
  </section>
</template>
