<script setup lang="ts">
const testimonials = [
  {
    quote: "Design Bridge cut our design-to-code cycle in half. The annotation system alone is worth it.",
    name: "Sofia Reyes",
    role: "Lead Designer @ Axiom",
    avatar: "SR",
  },
  {
    quote: "I never thought a Vite plugin could feel this magical. Tweaks work exactly how I hoped they would.",
    name: "Luca Bianchi",
    role: "Frontend Engineer @ Halo",
    avatar: "LB",
  },
  {
    quote: "Finally a tool that designers and engineers both want to use. Adoption was instant.",
    name: "Priya Sharma",
    role: "Product Manager @ Orbit",
    avatar: "PS",
  },
]
</script>

<template>
  <section class="py-24 px-6 bg-white">
    <div class="max-w-6xl mx-auto">
      <div class="text-center mb-16">
        <h2 class="text-3xl font-bold text-gray-900 mb-4">Loved by teams</h2>
        <p class="text-gray-500">Don't take our word for it.</p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
        <figure
          v-for="t in testimonials"
          :key="t.name"
          class="bg-gray-50 rounded-2xl p-8 border border-gray-100"
        >
          <blockquote class="text-gray-700 text-sm leading-relaxed mb-6">
            "{{ t.quote }}"
          </blockquote>
          <figcaption class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center">
              {{ t.avatar }}
            </div>
            <div>
              <p class="text-sm font-semibold text-gray-900">{{ t.name }}</p>
              <p class="text-xs text-gray-500">{{ t.role }}</p>
            </div>
          </figcaption>
        </figure>
      </div>
    </div>
  </section>
</template>
