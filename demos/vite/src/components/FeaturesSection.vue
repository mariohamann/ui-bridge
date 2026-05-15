<script setup lang="ts">
const features = [
  {
    icon: '⚡',
    title: 'Instant previews',
    description:
      'See every change reflected live in the browser without reloads or manual refresh cycles.',
  },
  {
    icon: '🎨',
    title: 'Design tokens',
    description:
      'Sync colours, spacing, and typography directly from your design tool into production CSS.',
  },
  {
    icon: '🔗',
    title: 'Component linking',
    description: 'Map Figma components to source files so comments always point at the right code.',
  },
  {
    icon: '🛡️',
    title: 'Type-safe',
    description:
      'Full TypeScript support from plugin config to runtime — no surprises at build time.',
  },
  {
    icon: '📦',
    title: 'Zero-config deploy',
    description:
      'Drop the plugin into any Vite project and go. Works with Vue, React, Svelte, and plain HTML.',
  },
  {
    icon: '🤝',
    title: 'Team collaboration',
    description: 'Comments are synced in real-time across every open tab for your whole team.',
  },
];
</script>

<template>
  <section>
    <div class="container">
      <div class="section-header">
        <h2>Everything you need</h2>
        <p>A curated set of tools designed to eliminate the gap between design and engineering.</p>
      </div>
      <div class="features-grid grid">
        <article v-for="feature in features" :key="feature.title" class="feature-card">
          <span class="feature-icon">{{ feature.icon }}</span>
          <h3>{{ feature.title }}</h3>
          <p>{{ feature.description }}</p>
        </article>
      </div>
    </div>
  </section>
</template>
