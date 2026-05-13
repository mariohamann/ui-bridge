<script setup lang="ts">
const links = ['Features', 'Pricing', 'Blog', 'Docs']
</script>

<template>
  <header>
    <nav class="container">
      <ul>
        <li><strong><a href="#">✦ Luminary</a></strong></li>
      </ul>
      <ul>
        <li v-for="link in links" :key="link">
          <a href="#" class="contrast">{{ link }}</a>
        </li>
        <li><button class="outline secondary">Log in</button></li>
        <li><button>Get started</button></li>
      </ul>
    </nav>
  </header>
</template>
