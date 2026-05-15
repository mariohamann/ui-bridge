import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// ── Hero fade-in ─────────────────────────────────────────────────────────────
gsap.from('#hero-content', { opacity: 0, y: 30, duration: 0.9, ease: 'power2.out', delay: 0.1 });
gsap.to('#hero-browser', { opacity: 1, y: 0, duration: 1, ease: 'power2.out', delay: 0.4 });

// ── Get Started section fade ──────────────────────────────────────────────────
gsap.from('#get-started > div', {
  scrollTrigger: { trigger: '#get-started', start: 'top 80%' },
  opacity: 0,
  y: 24,
  duration: 0.7,
  ease: 'power2.out',
});

// ── Scrollytelling: pin right panel, switch scenes on left scroll ─────────────

const scenes = [1, 2, 3, 4, 5];

function showScene(n: number) {
  scenes.forEach((i) => {
    const el = document.getElementById(`scene-${i}`);
    if (!el) return;
    if (i === n) {
      el.style.display = 'flex';
      gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out' });
    } else {
      gsap.to(el, {
        opacity: 0,
        duration: 0.2,
        onComplete: () => {
          el.style.display = 'none';
        },
      });
    }
  });
}

// Pin right column for the duration of the story section
ScrollTrigger.create({
  trigger: '#story',
  start: 'top top',
  end: 'bottom bottom',
  pin: '#story-right',
  pinSpacing: false,
});

// Per-step triggers
document.querySelectorAll<HTMLElement>('.story-step').forEach((step) => {
  const n = parseInt(step.dataset.step ?? '1', 10);
  ScrollTrigger.create({
    trigger: step,
    start: 'top center',
    end: 'bottom center',
    onEnter: () => {
      showScene(n);
      runSceneAnimation(n, 'enter');
    },
    onEnterBack: () => {
      showScene(n);
      runSceneAnimation(n, 'enter');
    },
    onLeave: () => runSceneAnimation(n, 'leave'),
    onLeaveBack: () => runSceneAnimation(n, 'leave'),
  });
});

// ── Per-scene animations ──────────────────────────────────────────────────────

let scene3Loop: gsap.core.Tween | null = null;
let scene5Loop: gsap.core.Timeline | null = null;

function runSceneAnimation(scene: number, direction: 'enter' | 'leave') {
  if (direction === 'leave') {
    if (scene === 3 && scene3Loop) {
      scene3Loop.kill();
      scene3Loop = null;
    }
    if (scene === 5 && scene5Loop) {
      scene5Loop.kill();
      scene5Loop = null;
    }
    return;
  }

  if (scene === 1) animateScene1();
  if (scene === 2) animateScene2();
  if (scene === 3) animateScene3();
  if (scene === 4) animateScene4();
  if (scene === 5) animateScene5();
}

// Scene 1 — chat bubbles stagger in
function animateScene1() {
  const bubbles = document.querySelectorAll('#scene-1 .chat-bubble');
  gsap.set(bubbles, { opacity: 0, x: 20 });
  gsap.to(bubbles, {
    opacity: 1,
    x: 0,
    duration: 0.4,
    stagger: 0.6,
    ease: 'power2.out',
    delay: 0.2,
  });
}

// Scene 2 — cursor moves to card, element highlights, comment appears
function animateScene2() {
  const cursor = document.getElementById('anim-cursor')!;
  const badge = document.getElementById('anim-badge')!;
  const panel = document.getElementById('anim-panel')!;
  const card = document.getElementById('demo-card-1')!;

  gsap.set(cursor, { opacity: 0, top: '20%', left: '60%' });
  gsap.set([badge, panel], { opacity: 0 });
  gsap.set(card, { outline: 'none', background: '#13131a' });

  const tl = gsap.timeline({ delay: 0.3 });
  tl.to(cursor, { opacity: 1, duration: 0.2 })
    .to(cursor, { top: '30%', left: '13%', duration: 0.7, ease: 'power2.inOut' })
    .to(
      card,
      { outline: '2px solid #7c6dfa', background: 'rgba(124,109,250,0.08)', duration: 0.2 },
      '-=0.1',
    )
    .to(cursor, { opacity: 0, duration: 0.15 }, '+=0.1')
    .to(badge, { opacity: 1, scale: 1, duration: 0.25, ease: 'back.out(2)' }, '-=0.1')
    .to(panel, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }, '-=0.05');
}

// Scene 3 — terminal lines appear one by one, then loop
function animateScene3() {
  const lines = ['#tl1', '#tl2', '#tl3', '#tl4', '#tl5'].map(
    (id) => document.querySelector(id) as HTMLElement,
  );
  gsap.set(lines, { opacity: 0 });

  const tl = gsap.timeline({ delay: 0.2 });
  lines.forEach((l, i) => tl.to(l, { opacity: 1, duration: 0.15, delay: i === 0 ? 0 : 0.5 }));

  // loop: fade all out and back in
  scene3Loop = gsap.to(lines, {
    opacity: 0,
    duration: 0.3,
    stagger: 0.1,
    delay: 3.5,
    onComplete: () => {
      gsap.set(lines, { opacity: 0 });
      animateScene3();
    },
  });
}

// Scene 4 — panel slides in from right
function animateScene4() {
  const panel = document.querySelector('#scene-4 > div') as HTMLElement;
  gsap.fromTo(
    panel,
    { x: 30, opacity: 0 },
    { x: 0, opacity: 1, duration: 0.4, ease: 'power2.out', delay: 0.2 },
  );
}

// Scene 5 — loop diagram nodes light up in sequence, loops
function animateScene5() {
  const nodes = [1, 2, 3, 4, 5].map((i) => document.getElementById(`ln${i}`)!);
  const lines = [1, 2, 3, 4].map((i) => document.getElementById(`ll${i}`)!);

  gsap.set([...nodes, ...lines], { opacity: 0.15 });

  const tl = gsap.timeline({ repeat: -1, delay: 0.3 });
  nodes.forEach((node, i) => {
    tl.to(node, { opacity: 1, duration: 0.3, ease: 'power2.out' });
    if (lines[i]) tl.to(lines[i], { opacity: 0.9, duration: 0.25 }, '<0.15');
    tl.to({}, { duration: 0.5 }); // hold
  });
  tl.to([...nodes, ...lines], { opacity: 0.15, duration: 0.5, stagger: 0.05 });
  tl.to({}, { duration: 0.5 });

  scene5Loop = tl;
}

// Show scene 1 immediately (before scroll triggers fire)
showScene(1);
animateScene1();
