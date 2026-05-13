<script setup lang="ts">
const plans = [
  {
    name: 'Hobby',
    price: 'Free',
    description: 'Perfect for side projects and solo exploration.',
    cta: 'Get started',
    highlighted: false,
    perks: ['1 project', 'Community support', 'Basic tweaks', '100 annotations / mo'],
  },
  {
    name: 'Pro',
    price: '$12',
    description: 'Everything you need to ship polished products.',
    cta: 'Start free trial',
    highlighted: true,
    perks: ['Unlimited projects', 'Priority support', 'Advanced tweaks', 'Unlimited annotations', 'Team sync'],
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    description: 'Tailored for large teams and complex workflows.',
    cta: 'Contact us',
    highlighted: false,
    perks: ['Everything in Pro', 'SSO / SAML', 'SLA guarantee', 'Dedicated onboarding'],
  },
]
</script>

<template>
  <section class="py-24 px-6 bg-gray-50">
    <div class="max-w-6xl mx-auto">
      <div class="text-center mb-16">
        <h2 class="text-3xl font-bold text-gray-900 mb-4">Simple pricing</h2>
        <p class="text-gray-500">No hidden fees. Cancel any time.</p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
        <div
          v-for="plan in plans"
          :key="plan.name"
          :class="[
            'rounded-2xl p-8 border transition-all',
            plan.highlighted
              ? 'bg-violet-600 border-violet-600 text-white shadow-2xl shadow-violet-200 scale-105'
              : 'bg-white border-gray-100',
          ]"
        >
          <p :class="['text-sm font-semibold uppercase tracking-wide mb-2', plan.highlighted ? 'text-violet-200' : 'text-violet-600']">
            {{ plan.name }}
          </p>
          <p :class="['text-4xl font-extrabold mb-1', plan.highlighted ? 'text-white' : 'text-gray-900']">
            {{ plan.price }}
            <span v-if="plan.price !== 'Free' && plan.price !== 'Custom'" :class="['text-base font-normal', plan.highlighted ? 'text-violet-200' : 'text-gray-400']">/ mo</span>
          </p>
          <p :class="['text-sm mb-6', plan.highlighted ? 'text-violet-100' : 'text-gray-500']">{{ plan.description }}</p>
          <button
            :class="[
              'w-full py-2.5 rounded-xl font-semibold text-sm transition-colors mb-8',
              plan.highlighted
                ? 'bg-white text-violet-600 hover:bg-violet-50'
                : 'bg-gray-900 text-white hover:bg-gray-700',
            ]"
          >
            {{ plan.cta }}
          </button>
          <ul class="space-y-3">
            <li
              v-for="perk in plan.perks"
              :key="perk"
              :class="['flex items-center gap-2 text-sm', plan.highlighted ? 'text-violet-100' : 'text-gray-600']"
            >
              <span>✓</span> {{ perk }}
            </li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>
