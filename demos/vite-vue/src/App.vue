<script setup lang="ts">
import AppNav from './components/AppNav.vue'
import HeroSection from './components/HeroSection.vue'
import FeaturesSection from './components/FeaturesSection.vue'
import PricingSection from './components/PricingSection.vue'
import TestimonialsSection from './components/TestimonialsSection.vue'
import CtaSection from './components/CtaSection.vue'
import AppFooter from './components/AppFooter.vue'
</script>

<template>
  <div class="min-h-screen font-sans antialiased">
    <AppNav />
    <main>
      <HeroSection />
      <FeaturesSection />
      <PricingSection />
      <TestimonialsSection />
      <CtaSection />
    </main>
    <AppFooter />
  </div>
</template>
