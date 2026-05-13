// Live knobs demo — wires the knob inputs in Scene 4 to the demo card/button

const btn = document.getElementById('demo-btn') as HTMLElement | null;
const cardText = document.getElementById('demo-card-text') as HTMLElement | null;

if (btn) {
  // ── Number: padding ──────────────────────────────────────────────────────
  const kNum = document.getElementById('k-num') as HTMLInputElement;
  const kvNum = document.getElementById('kv-num')!;
  kNum?.addEventListener('input', () => {
    const v = kNum.value;
    kvNum.textContent = `${v}px`;
    btn.style.padding = `${v}px ${parseInt(v) * 2}px`;
  });

  // ── Color: background ────────────────────────────────────────────────────
  const kColor = document.getElementById('k-color') as HTMLInputElement;
  const kvColor = document.getElementById('kv-color')!;
  const kvColorPreview = document.getElementById('kv-color-preview')!;
  kColor?.addEventListener('input', () => {
    const v = kColor.value;
    kvColor.textContent = v;
    kvColorPreview.style.background = v;
    btn.style.background = v;
  });

  // ── Text: label ──────────────────────────────────────────────────────────
  const kText = document.getElementById('k-text') as HTMLInputElement;
  kText?.addEventListener('input', () => {
    btn.textContent = kText.value || 'Action';
  });

  // ── Boolean: rounded ────────────────────────────────────────────────────
  const kBool = document.getElementById('k-bool') as HTMLInputElement;
  const kBoolTrack = document.getElementById('k-bool-track')!;
  const kBoolThumb = document.getElementById('k-bool-thumb')!;
  kBool?.addEventListener('change', () => {
    const on = kBool.checked;
    kBoolTrack.style.background = on ? '#7c6dfa' : '#1e1e2e';
    kBoolThumb.style.transform = on ? 'translateX(13px)' : 'translateX(0)';
    btn.style.borderRadius = on ? '100px' : '5px';
  });

  // ── Select: size ─────────────────────────────────────────────────────────
  const kSelect = document.getElementById('k-select') as HTMLSelectElement;
  const sizeMap: Record<string, string> = { sm: '8px', md: '10px', lg: '13px' };
  kSelect?.addEventListener('change', () => {
    btn.style.fontSize = sizeMap[kSelect.value] ?? '10px';
  });

  // ── Button-group: variant ────────────────────────────────────────────────
  const variantMap: Record<string, { bg: string; color: string }> = {
    primary: { bg: '#7c6dfa', color: '#fff' },
    secondary: { bg: 'transparent', color: '#8888a0' },
    danger: { bg: '#ef4444', color: '#fff' },
  };
  document.querySelectorAll<HTMLButtonElement>('.kb').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll<HTMLButtonElement>('.kb').forEach((x) => {
        x.style.background = 'transparent';
        x.style.color = '#6b6b80';
      });
      const v = variantMap[b.dataset.val!];
      if (v) {
        btn.style.background = v.bg;
        btn.style.color = v.color;
      }
      b.style.background = `${variantMap[b.dataset.val!]?.bg ?? '#7c6dfa'}33`;
      b.style.color = variantMap[b.dataset.val!]?.bg ?? '#7c6dfa';

      // also update the color knob to reflect variant color
      const kc = document.getElementById('k-color') as HTMLInputElement | null;
      if (kc && v) {
        kc.value = v.bg.startsWith('#') ? v.bg : '#7c6dfa';
        const kvc = document.getElementById('kv-color');
        const kvcp = document.getElementById('kv-color-preview');
        if (kvc) kvc.textContent = kc.value;
        if (kvcp) kvcp.style.background = kc.value;
      }
    });
  });

  // ── Finalize: flash effect ───────────────────────────────────────────────
  const kFinalize = document.getElementById('k-finalize')!;
  kFinalize?.addEventListener('click', () => {
    kFinalize.textContent = '✓ Written to source';
    kFinalize.style.background = '#4ade80';
    kFinalize.style.color = '#0a1f0a';
    setTimeout(() => {
      kFinalize.textContent = 'Finalize ↗';
      kFinalize.style.background = '#7c6dfa';
      kFinalize.style.color = '#fff';
    }, 2000);
  });
}
