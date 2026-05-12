import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { Annotation } from '@design-bridge/core';

// ── Helpers ──────────────────────────────────────────────────────────────────

function relTime(ts: number | undefined): string {
  if (!ts) return '';
  const d = Date.now() - ts;
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

function pageLabel(url: string): string {
  try { const u = new URL(url); return u.pathname === '/' ? u.host : u.host + u.pathname; } catch { return url || ''; }
}

function sourceLabel(ann: Annotation): string {
  if (ann.source?.file) {
    const filename = ann.source.file.split('/').pop() ?? '';
    return filename.replace(/\.[^.]+$/, '');
  }
  return ann.labels?.[0] || pageLabel((ann as any).pageUrl ?? '') || '';
}

function stableRanks(annotations: Annotation[]): Map<string, number> {
  const open = [...annotations]
    .filter((a) => !a.resolvedAt)
    .sort((a, b) => ((a as any).createdAt || a.timestamp || 0) - ((b as any).createdAt || b.timestamp || 0));
  return new Map(open.map((a, i) => [a.id, i + 1]));
}

// ── Component ─────────────────────────────────────────────────────────────────

@customElement('bridge-review-page')
export class BridgeReviewPage extends LitElement {
  @state() private _annotations: Annotation[] = [];
  @state() private _showResolved = false;
  @state() private _openMenuId: string | null = null;
  @state() private _connected = false;

  private _ws: WebSocket | null = null;

  static styles = css`
    :host {
      --bg: #1e1e2e; --surface: #313244; --surface2: #3c3e52; --border: #45475a;
      --text: #cdd6f4; --muted: #6c7086; --subtext: #a6adc8;
      --amber: #f59e0b;
      --green: #a6e3a1;
      --red: #f38ba8;
      --r: 6px; --r-sm: 4px;
      --font: system-ui, -apple-system, sans-serif;
      --mono: ui-monospace, monospace;
      display: block;
      background: var(--bg);
      color: var(--text);
      font-family: var(--font);
      font-size: 13px;
      min-height: 100vh;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── Top bar ── */
    .bar {
      position: sticky; top: 0; z-index: 100;
      background: var(--bg); border-bottom: 1px solid var(--border);
      padding: 6px 12px; display: flex; align-items: center; gap: 8px;
    }
    .bar-title { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--subtext); flex: 1; }
    .bar-title strong { color: var(--amber); }
    .count { background: var(--amber); color: #1e1e2e; font-size: 10px; font-weight: 700; border-radius: 10px; padding: 1px 6px; }
    .count.zero { background: var(--border); color: var(--muted); }
    .dot { width: 5px; height: 5px; border-radius: 50%; background: var(--border); flex-shrink: 0; }
    .dot.ok { background: var(--green); }

    /* bar menu */
    .bar-menu-wrap { position: relative; }
    .bar-dots {
      all: unset; cursor: pointer; display: flex; align-items: center; justify-content: center;
      width: 24px; height: 24px; border-radius: var(--r-sm);
      color: var(--muted); font-size: 15px; letter-spacing: 1px; line-height: 1;
      transition: background .1s, color .1s;
    }
    .bar-dots:hover { background: var(--surface); color: var(--text); }
    .bar-dropdown {
      position: absolute; top: calc(100% + 4px); right: 0; z-index: 200;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--r); padding: 4px; min-width: 160px;
      box-shadow: 0 6px 18px rgba(0,0,0,.5);
    }
    .bar-mi {
      all: unset; display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box;
      padding: 6px 10px; font-size: 12px; border-radius: var(--r-sm);
      cursor: pointer; color: var(--text); transition: background .08s;
    }
    .bar-mi:hover { background: var(--border); }
    .bar-mi .check { color: var(--amber); font-size: 10px; width: 12px; text-align: center; }

    /* ── List ── */
    .list { max-width: 620px; margin: 0 auto; padding: 12px 16px 80px; display: flex; flex-direction: column; gap: 2px; }
    .empty { text-align: center; color: var(--muted); padding: 72px 16px; font-size: 13px; line-height: 1.7; }

    /* ── Row ── */
    .row {
      display: flex; align-items: flex-start; gap: 8px;
      padding: 7px 8px 7px 10px; border-radius: var(--r);
      cursor: pointer; position: relative;
      border-bottom: 1px solid rgba(69,71,90,.5);
      transition: background .1s;
    }
    .row:last-child { border-bottom: none; }
    .row:hover { background: rgba(245,158,11,.05); }
    .row.resolved { opacity: .45; }
    .row.resolved:hover { opacity: .65; }

    .num {
      flex-shrink: 0; margin-top: 2px;
      width: 16px; height: 16px; border-radius: 50%;
      background: var(--amber); color: #1e1e2e;
      font-size: 8px; font-weight: 700; line-height: 16px; text-align: center;
    }
    .num.done { background: var(--surface2); color: var(--green); }

    .body { flex: 1; min-width: 0; }
    .meta { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
    .src-label { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
    .ts { font-size: 10px; color: var(--border); flex-shrink: 0; }
    .comment { font-size: 12px; line-height: 1.5; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .comment.empty-comment { color: var(--muted); font-style: italic; }
    .footer { display: flex; align-items: center; gap: 8px; margin-top: 2px; }
    .reply-count { font-size: 10px; color: var(--muted); }
    .resolved-tag { font-size: 10px; color: var(--green); font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }

    .menu-wrap { position: relative; flex-shrink: 0; align-self: flex-start; }
    .dots {
      all: unset; cursor: pointer; display: flex; align-items: center; justify-content: center;
      width: 24px; height: 24px; border-radius: var(--r-sm);
      color: var(--border); font-size: 15px; letter-spacing: 1px; line-height: 1;
      transition: background .1s, color .1s; opacity: 0;
    }
    .row:hover .dots { opacity: 1; }
    .dots:hover { background: var(--surface2); color: var(--text); }
    .overflow-menu {
      position: absolute; top: 100%; right: 0; z-index: 200;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--r); padding: 4px; min-width: 160px;
      box-shadow: 0 6px 18px rgba(0,0,0,.5);
    }
    .mi {
      all: unset; display: block; width: 100%; box-sizing: border-box;
      padding: 6px 10px; font-size: 12px; border-radius: var(--r-sm);
      cursor: pointer; color: var(--text); transition: background .08s;
    }
    .mi:hover { background: var(--border); }
    .mi.danger { color: var(--red); }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    this._connect();
    this._fetchInitial();
    document.addEventListener('click', this._onDocClick);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._ws?.close();
    document.removeEventListener('click', this._onDocClick);
  }

  private _connect(): void {
    const url = `ws://localhost:${location.port}/design-bridge`;
    this._ws = new WebSocket(url);
    this._ws.onopen = () => { this._connected = true; };
    this._ws.onclose = () => { this._connected = false; setTimeout(() => this._connect(), 1500); };
    this._ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data as string);
        if (m.type === 'annotations:sync') { this._annotations = m.payload; }
      } catch { /* noop */ }
    };
  }

  private async _fetchInitial(): Promise<void> {
    try {
      const res = await fetch(`${location.origin}/api/annotations`);
      const data = await res.json() as { annotations: Annotation[] };
      if (data.annotations) this._annotations = data.annotations;
    } catch { /* noop */ }
  }

  private _onDocClick = (e: MouseEvent): void => {
    const target = e.composedPath()[0] as Element;
    if (!this.shadowRoot?.contains(target)) return;
    if (!(target as Element).closest?.('.bar-menu-wrap')) {
      // close handled in template via toggle
    }
    if (!(target as Element).closest?.('.menu-wrap')) {
      if (this._openMenuId !== null) { this._openMenuId = null; }
    }
  };

  private _sendFocus(id: string): void {
    if (this._ws?.readyState === 1) {
      this._ws.send(JSON.stringify({ type: 'annotation:focus', payload: { id } }));
    }
  }

  private _resolve(id: string): void {
    const ann = this._annotations.find((a) => a.id === id);
    if (!ann) return;
    this._post('/api/annotations', { ...ann, resolvedAt: Date.now(), timestamp: Date.now() });
    this._openMenuId = null;
  }

  private _unresolve(id: string): void {
    const ann = this._annotations.find((a) => a.id === id);
    if (!ann) return;
    const u = { ...ann, timestamp: Date.now() } as Annotation & { resolvedAt?: number };
    delete u.resolvedAt;
    this._post('/api/annotations', u);
    this._openMenuId = null;
  }

  private _discard(id: string): void {
    fetch(`${location.origin}/api/annotations/${id}`, { method: 'DELETE' }).catch(() => {});
    this._openMenuId = null;
  }

  private _copyLink(id: string): void {
    const ann = this._annotations.find((a) => a.id === id);
    if (!ann) return;
    navigator.clipboard.writeText((ann as any).pageUrl || location.href).catch(() => {});
    this._openMenuId = null;
  }

  private _post(path: string, body: unknown): void {
    fetch(`${location.origin}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {});
  }

  private _renderRow(ann: Annotation, rank: Map<string, number>) {
    const resolved = !!ann.resolvedAt;
    const idx = resolved ? null : rank.get(ann.id);
    const replies = (ann.replies ?? []).filter((r) => r.type === 'comment');
    const extraReplies = replies.length - 1;
    const menuOpen = this._openMenuId === ann.id;

    return html`
      <div class="row${resolved ? ' resolved' : ''}"
        @click=${(e: Event) => { if (!(e.target as Element).closest('.menu-wrap')) this._sendFocus(ann.id); }}>
        <div class="num${resolved ? ' done' : ''}">${resolved ? '✓' : idx}</div>
        <div class="body">
          <div class="meta">
            <span class="src-label">${sourceLabel(ann)}</span>
            <span class="ts">${relTime((ann as any).createdAt ?? ann.timestamp)}</span>
            ${resolved ? html`<span class="resolved-tag">resolved</span>` : ''}
          </div>
          ${ann.comment
            ? html`<div class="comment">${ann.comment}</div>`
            : html`<div class="comment empty-comment">No comment</div>`}
          ${extraReplies > 0
            ? html`<div class="footer"><span class="reply-count">${extraReplies} repl${extraReplies === 1 ? 'y' : 'ies'}</span></div>`
            : ''}
        </div>
        <div class="menu-wrap"
          @click=${(e: Event) => { e.stopPropagation(); this._openMenuId = menuOpen ? null : ann.id; }}>
          <button class="dots" title="More">···</button>
          ${menuOpen ? html`
            <div class="overflow-menu" @click=${(e: Event) => e.stopPropagation()}>
              ${!resolved
                ? html`<button class="mi" @click=${() => this._resolve(ann.id)}>✓ Mark resolved</button>`
                : html`<button class="mi" @click=${() => this._unresolve(ann.id)}>↩ Unresolve</button>`}
              <button class="mi" @click=${() => this._copyLink(ann.id)}>Copy page link</button>
              <button class="mi danger" @click=${() => this._discard(ann.id)}>Delete</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  render() {
    const sorted = [...this._annotations].sort(
      (a, b) => (((b as any).createdAt || b.timestamp || 0) - ((a as any).createdAt || a.timestamp || 0))
    );
    const visible = this._showResolved ? sorted : sorted.filter((a) => !a.resolvedAt);
    const openCount = this._annotations.filter((a) => !a.resolvedAt).length;
    const rank = stableRanks(this._annotations);

    return html`
      <div class="bar" @click=${(e: Event) => {
        if (!(e.target as Element).closest('.bar-menu-wrap')) this._openMenuId = null;
      }}>
        <span class="bar-title"><strong>Design Bridge</strong> — Annotations</span>
        <span class="count${openCount ? '' : ' zero'}">${openCount}</span>
        <span class="dot${this._connected ? ' ok' : ''}"></span>
        <div class="bar-menu-wrap">
          <button class="bar-dots" title="Options"
            @click=${(e: Event) => { e.stopPropagation(); this._showResolved = !this._showResolved; }}>
            ···
          </button>
        </div>
      </div>
      <div class="list">
        ${visible.length === 0 ? html`
          <div class="empty">
            ${this._annotations.length === 0
              ? html`No annotations yet.<br><span style="color:var(--border)">Hold Alt+Shift and click any element in your app.</span>`
              : 'All annotations resolved.'}
          </div>
        ` : visible.map((ann) => this._renderRow(ann, rank))}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap { 'bridge-review-page': BridgeReviewPage; }
}
