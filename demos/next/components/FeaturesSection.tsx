export default function FeaturesSection() {
  return (
    <section className="uib-features">
      <div className="uib-feature-card">
        <h3>Live Tweaks</h3>
        <p>Change colors, spacing, and typography in real-time without touching source files.</p>
      </div>
      <div className="uib-feature-card">
        <h3>Comments</h3>
        <p>Leave contextual comments directly on UI elements, linked to your source code.</p>
      </div>
      <div className="uib-feature-card">
        <h3>Next.js-native</h3>
        <p>Integrates via the webpack config — works with App Router and Pages Router.</p>
      </div>
    </section>
  );
}
