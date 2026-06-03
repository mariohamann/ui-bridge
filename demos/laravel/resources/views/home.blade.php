<x-layouts.app>
    @include('partials.header')

    <main>
        <section class="hero">
            <div class="container">
                <span class="hero-badge">Now in public beta</span>
                <h1>Design and ship<br /><span>faster than ever.</span></h1>
                <p>
                    Luminary is the all-in-one platform that connects your design workflow to
                    production code — with zero friction.
                </p>
                <div class="hero-cta">
                    <button>Start for free</button>
                    <button class="outline secondary">Watch demo ▶</button>
                </div>
            </div>
        </section>

        <section>
            <div class="container">
                <div class="section-header">
                    <h2>Everything you need</h2>
                    <p>A curated set of tools designed to eliminate the gap between design and engineering.</p>
                </div>
                @php
                $features = [
                    ['icon' => '⚡', 'title' => 'Instant previews', 'body' => 'See every change reflected live in the browser without reloads or manual refresh cycles.'],
                    ['icon' => '🎨', 'title' => 'Design tokens', 'body' => 'Sync colours, spacing, and typography directly from your design tool into production CSS.'],
                    ['icon' => '🔗', 'title' => 'Component linking', 'body' => 'Map Figma components to source files so comments always point at the right code.'],
                    ['icon' => '🛡️', 'title' => 'Type-safe', 'body' => 'Full TypeScript support from plugin config to runtime — no surprises at build time.'],
                    ['icon' => '📦', 'title' => 'Zero-config deploy', 'body' => 'Drop the plugin into any Laravel + Vite project and go.'],
                    ['icon' => '🤝', 'title' => 'Team collaboration', 'body' => 'Comments are synced in real-time across every open tab for your whole team.'],
                ];
                @endphp
                <div class="features-grid grid">
                    @foreach($features as $feature)
                        <x-partials.feature-card :icon="$feature['icon']" :title="$feature['title']" :body="$feature['body']" />
                    @endforeach
                </div>
            </div>
        </section>

        <section>
            <div class="container">
                <article class="cta-card">
                    <hgroup>
                        <h2>Ready to bridge the gap?</h2>
                        <p>Join thousands of teams already using Luminary to ship better products, faster.</p>
                    </hgroup>
                    <button>Start for free — no credit card needed</button>
                </article>
            </div>
        </section>
    </main>

    @include('partials.footer')
</x-layouts.app>
