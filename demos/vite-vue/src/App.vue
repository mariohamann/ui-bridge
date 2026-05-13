<script setup lang="ts">
import AppNav from './components/AppNav.vue'
import HeroSection from './components/HeroSection.vue'
import FeaturesSection from './components/FeaturesSection.vue'
import CtaSection from './components/CtaSection.vue'
import AppFooter from './components/AppFooter.vue'
</script>

<template>
  <AppNav />
  <main>
    <HeroSection />
    <FeaturesSection />
    <CtaSection />
  </main>
  <AppFooter />
</template>
