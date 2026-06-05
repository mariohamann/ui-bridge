const SEGMENTS = [
  { start: 0, end: 7 },
  { start: 7, end: 17 },
  { start: 17, end: Infinity },
];

const band = document.querySelector('.how-it-works-band');
const ol = band?.querySelector('ol');

if (band && ol) {
  const items = Array.from(ol.querySelectorAll<HTMLLIElement>(':scope > li'));

  // Enhance each li's <strong> into a seekable button
  items.forEach((li, i) => {
    li.style.setProperty('--fill', '0');
    const strong = li.querySelector('strong');
    if (!strong) return;

    const btn = document.createElement('button');
    btn.setAttribute('aria-label', `Jump to step ${i + 1}: ${strong.textContent ?? ''}`);
    btn.className = 'hiw-seek-btn';
    strong.replaceWith(btn);
    btn.appendChild(strong);
  });

  // Remove any video element already rendered from the README source
  band.querySelectorAll('video').forEach((v) => v.closest('p')?.remove() ?? v.remove());

  // Remove the raw GitHub video URL link that GitHub renders as a video but shows as a plain link in the docs
  band.querySelectorAll('a').forEach((a) => {
    if (a.href.includes('github.com/user-attachments/assets/')) {
      a.closest('p')?.remove() ?? a.remove();
    }
  });

  // Build video wrapper
  const videoWrapper = document.createElement('div');
  videoWrapper.className = 'hiw-video-wrapper';

  const video = document.createElement('video');
  video.src = '/ui-bridge.mp4';
  video.autoplay = true;
  video.muted = true;
  video.loop = true;
  video.setAttribute('playsinline', '');

  // Video controls bar
  const controls = document.createElement('div');
  controls.className = 'hiw-video-controls';

  const pauseBtn = document.createElement('button');
  pauseBtn.textContent = 'Pause';
  pauseBtn.setAttribute('aria-label', 'Pause video');

  const speedSelect = document.createElement('select');
  speedSelect.setAttribute('aria-label', 'Playback speed');
  [
    ['0.25×', '0.25'],
    ['0.5×', '0.5'],
    ['1×', '1'],
    ['2×', '2'],
  ].forEach(([label, val]) => {
    const opt = document.createElement('option');
    opt.textContent = label;
    opt.value = val;
    if (val === '1') opt.selected = true;
    speedSelect.appendChild(opt);
  });

  controls.appendChild(pauseBtn);
  controls.appendChild(speedSelect);

  videoWrapper.appendChild(video);
  ol.after(videoWrapper);
  videoWrapper.after(controls);

  // Pause/play toggle
  pauseBtn.addEventListener('click', () => {
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  });

  video.addEventListener('pause', () => {
    pauseBtn.textContent = 'Play';
    pauseBtn.setAttribute('aria-label', 'Play video');
  });

  video.addEventListener('play', () => {
    pauseBtn.textContent = 'Pause';
    pauseBtn.setAttribute('aria-label', 'Pause video');
  });

  // Speed select
  speedSelect.addEventListener('change', () => {
    video.playbackRate = parseFloat(speedSelect.value);
  });

  // Click video to pause/play
  video.addEventListener('click', () => {
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  });

  // Sync fill on each step as the video plays
  video.addEventListener('timeupdate', () => {
    const t = video.currentTime;
    items.forEach((li, i) => {
      const seg = SEGMENTS[i];
      const segEnd = seg.end === Infinity ? video.duration || 30 : seg.end;
      const segDuration = segEnd - seg.start;

      if (t < seg.start) {
        li.removeAttribute('data-active');
        li.style.setProperty('--fill', '0');
      } else if (t >= segEnd) {
        li.removeAttribute('data-active');
        li.style.setProperty('--fill', '1');
      } else {
        li.setAttribute('data-active', '');
        li.style.setProperty('--fill', String((t - seg.start) / segDuration));
      }
    });
  });

  // Click any step button to seek to that segment
  items.forEach((li, i) => {
    li.querySelector('.hiw-seek-btn')?.addEventListener('click', () => {
      video.currentTime = SEGMENTS[i].start;
      video.play();
    });
  });
}
