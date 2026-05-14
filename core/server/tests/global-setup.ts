import { rm, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_ROOT = resolve(__dirname, '../.test-root');

/** Minimal Vue SFC used as the target file for content-edit tweak tests. */
const FEATURES_SECTION_VUE = `<script setup lang="ts">
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
`;

export default async function globalSetup(): Promise<void> {
  // Start from a clean slate each test run.
  await rm(TEST_ROOT, { recursive: true, force: true });
  await mkdir(TEST_ROOT, { recursive: true });

  // Create fixture source file for tweak tests.
  const fixtureDir = resolve(TEST_ROOT, 'src', 'components');
  await mkdir(fixtureDir, { recursive: true });
  await writeFile(resolve(fixtureDir, 'FeaturesSection.vue'), FEATURES_SECTION_VUE, 'utf-8');
}
