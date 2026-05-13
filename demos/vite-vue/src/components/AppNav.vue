<script setup lang="ts">
const links = ['Features', 'Pricing', 'Blog', 'Docs']
</script>

<template>
  <header class="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-gray-100">
    <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
      <a href="#" class="text-xl font-bold tracking-tight text-gray-900">
        ✦ Luminary
      </a>
      <nav class="hidden md:flex items-center gap-8">
        <a
          v-for="link in links"
          :key="link"
          href="#"
          class="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
        >
          {{ link }}
        </a>
      </nav>
      <div class="flex items-center gap-3">
        <button class="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
          Log in
        </button>
        <button class="bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors">
          Get started
        </button>
      </div>
    </div>
  </header>
</template>
