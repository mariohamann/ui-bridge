import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { Annotation } from '@design-bridge/core';
import { designBridgeHostTokenStyles } from '../styles/tokens.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function pageLabel(url: string): string {
  try { const u = new URL(url); return u.pathname === '/' ? u.host : u.host + u.pathname; } catch { return url || ''; }
}

function sourceLabel(ann: Annotation): string {
  if (ann.source?.file) {
    const filename = ann.source.file.split('/').pop() ?? '';
    return filename.replace(/\.[^.]+$/, '');
  }
  return ann.labels?.[0] || pageLabel(ann.pageUrl ?? '') || '';
}

function stableRanks(annotations: Annotation[]): Map<string, number> {
  const open = [...annotations]
    .filter((a) => !a.resolvedAt)
    .sort((a, b) =>
      (a.createdAt || a.timestamp || 0) -
      (b.createdAt || b.timestamp || 0)
    );
  return new Map(open.map((a, i) => [a.id, i + 1]));
}

// ── Component ─────────────────────────────────────────────────────────────────

@customElement('bridge-review-page')
export class BridgeReviewPage extends LitElement {
  @state() private _annotations: Annotation[] = [];
  @state() private _showResolved = false;
  @state() private _connected = false;

  private _ws: WebSocket | null = null;

  static styles = [
    designBridgeHostTokenStyles,
    css`
      :host {
        display: block;
        background: var(--wa-color-surface-default);
        color: var(--wa-color-text-normal);
        font-family: var(--wa-font-family-body);
        font-size: var(--wa-font-size-s);
        min-height: 100vh;
      }

      /* ── Top bar ── */
      .bar {
        position: sticky; top: 0; z-index: 100;
        background: var(--wa-color-surface-default); border-bottom: 1px solid var(--wa-color-surface-border);
        padding: var(--wa-space-xs) var(--wa-space-s);
        display: flex; align-items: center; gap: var(--wa-space-s);
      }
      .bar-title {
        font-size: var(--wa-font-size-xs);
        font-weight: var(--wa-font-weight-bold);
        letter-spacing: .08em;
        text-transform: uppercase;
        color: var(--wa-color-text-quiet);
        flex: 1;
      }
      .bar-title strong { color: var(--wa-color-brand); }
      .dot { width: 5px; height: 5px; border-radius: 50%; background: var(--wa-color-surface-border); flex-shrink: 0; }
      .dot.ok { background: var(--wa-color-success); }
      .toggle-label { font-size: var(--wa-font-size-xs); color: var(--wa-color-text-quiet); white-space: nowrap; }

      /* ── List ── */
      .list { max-width: 620px; margin: 0 auto; padding: var(--wa-space-s) var(--wa-space-l) 80px; display: flex; flex-direction: column; gap: 2px; }
      .empty { text-align: center; color: var(--wa-color-text-quiet); padding: 72px var(--wa-space-l); font-size: var(--wa-font-size-s); line-height: 1.7; }

      /* ── Row ── */
      .row {
        display: flex; align-items: flex-start; gap: var(--wa-space-s);
        padding: var(--wa-space-xs) var(--wa-space-s) var(--wa-space-xs) var(--wa-space-s);
        border-radius: var(--wa-border-radius-s);
        cursor: pointer; position: relative;
        border-bottom: 1px solid color-mix(in srgb, var(--wa-color-surface-border) 50%, transparent);
        transition: background .1s;
      }
      .row:last-child { border-bottom: none; }
      .row:hover { background: var(--wa-color-brand-fill-quiet); }
      .row.resolved { opacity: .45; }
      .row.resolved:hover { opacity: .65; }

      .body { flex: 1; min-width: 0; }
      .meta { display: flex; align-items: center; gap: var(--wa-space-2xs); margin-bottom: 2px; flex-wrap: wrap; }
      .src-label { font-size: var(--wa-font-size-xs); color: var(--wa-color-text-quiet); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
      .comment { font-size: var(--wa-font-size-xs); line-height: 1.5; color: var(--wa-color-text-normal); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .comment.empty-comment { color: var(--wa-color-text-quiet); font-style: italic; }
      .footer { display: flex; align-items: center; gap: var(--wa-space-xs); margin-top: var(--wa-space-3xs); }

      .row-menu { flex-shrink: 0; align-self: flex-start; opacity: 0; transition: opacity .1s; }
      .row:hover .row-menu { opacity: 1; }
    `,
  ];

  connectedCallback(): void {
    super.connectedCallback();
    this.classList.add('wa-dark');
    this._connect();
    this._fetchInitial();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._ws?.close();
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
      const data = await res.json() as { annotations: Annotation[]; };
      if (data.annotations) this._annotations = data.annotations;
    } catch { /* noop */ }
  }

  private _sendFocus(id: string): void {
    if (this._ws?.readyState === 1) {
      this._ws.send(JSON.stringify({ type: 'annotation:focus', payload: { id } }));
    }
  }

  private _resolve(id: string): void {
    const ann = this._annotations.find((a) => a.id === id);
    if (!ann) return;
    this._post('/api/annotations', { ...ann, resolvedAt: Date.now(), timestamp: Date.now() });
  }

  private _unresolve(id: string): void {
    const ann = this._annotations.find((a) => a.id === id);
    if (!ann) return;
    const u = { ...ann, timestamp: Date.now() } as Annotation & { resolvedAt?: number; };
    delete u.resolvedAt;
    this._post('/api/annotations', u);
  }

  private _discard(id: string): void {
    fetch(`${location.origin}/api/annotations/${id}`, { method: 'DELETE' }).catch(() => { });
  }

  private _copyLink(id: string): void {
    const ann = this._annotations.find((a) => a.id === id);
    if (!ann) return;
    navigator.clipboard.writeText(ann.pageUrl || location.href).catch(() => { });
  }

  private _post(path: string, body: unknown): void {
    fetch(`${location.origin}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => { });
  }

  private _renderRow(ann: Annotation, rank: Map<string, number>) {
    const resolved = !!ann.resolvedAt;
    const idx = resolved ? null : rank.get(ann.id);
    const ts = ann.createdAt ?? ann.timestamp;
    const replies = (ann.replies ?? []).filter((r) => r.type === 'comment');
    const extraReplies = replies.length - 1;

    return html`
      <div class="row${resolved ? ' resolved' : ''}"
        @click=${(e: Event) => { if (!(e.target as Element).closest('wa-dropdown')) this._sendFocus(ann.id); }}>

        <!-- Index badge -->
        <wa-badge
          pill
          variant=${resolved ? 'success' : 'brand'}
          appearance="filled"
          style="flex-shrink:0;margin-top:2px;"
        >${resolved ? '✓' : idx}</wa-badge>

        <div class="body">
          <div class="meta">
            <span class="src-label">${sourceLabel(ann)}</span>
            <wa-relative-time sync .date=${new Date(ts)} style="font-size:var(--wa-font-size-2xs);color:var(--wa-color-text-quiet);"></wa-relative-time>
            ${resolved ? html`<wa-tag variant="success" appearance="outlined" size="s">resolved</wa-tag>` : ''}
          </div>
          ${ann.comment
        ? html`<div class="comment">${ann.comment}</div>`
        : html`<div class="comment empty-comment">No comment</div>`}
          ${extraReplies > 0
        ? html`<div class="footer">
                <wa-tag variant="neutral" appearance="outlined" size="s">${extraReplies} repl${extraReplies === 1 ? 'y' : 'ies'}</wa-tag>
              </div>`
        : ''}
        </div>

        <!-- Per-row actions dropdown -->
        <wa-dropdown size="s" class="row-menu" @click=${(e: Event) => e.stopPropagation()} @wa-select=${(e: CustomEvent) => {
        const val = e.detail.item.value;
        if (val === 'resolve') this._resolve(ann.id);
        else if (val === 'unresolve') this._unresolve(ann.id);
        else if (val === 'copy') this._copyLink(ann.id);
        else if (val === 'delete') this._discard(ann.id);
      }}>
          <wa-button slot="trigger" appearance="plain" size="s" title="More">···</wa-button>
          ${!resolved
        ? html`<wa-dropdown-item value="resolve">✓ Mark resolved</wa-dropdown-item>`
        : html`<wa-dropdown-item value="unresolve">↩ Unresolve</wa-dropdown-item>`}
          <wa-dropdown-item value="copy">Copy page link</wa-dropdown-item>
          <wa-divider></wa-divider>
          <wa-dropdown-item value="delete" variant="danger">Delete</wa-dropdown-item>
        </wa-dropdown>
      </div>
    `;
  }

  render() {
    const sorted = [...this._annotations].sort(
      (a, b) =>
      ((b.createdAt || b.timestamp || 0) -
        (a.createdAt || a.timestamp || 0))
    );
    const visible = this._showResolved ? sorted : sorted.filter((a) => !a.resolvedAt);
    const openCount = this._annotations.filter((a) => !a.resolvedAt).length;
    const rank = stableRanks(this._annotations);

    return html`
      <div class="bar">
        <span class="bar-title"><strong>Design Bridge</strong> — Annotations</span>
        <wa-badge pill variant=${openCount ? 'brand' : 'neutral'} appearance="filled">${openCount}</wa-badge>
        <span class="dot${this._connected ? ' ok' : ''}"></span>
        <span class="toggle-label">Show resolved</span>
        <wa-switch size="s"
          ?checked=${this._showResolved}
          @wa-change=${(e: Event) => { this._showResolved = (e.target as HTMLInputElement).checked; }}
        ></wa-switch>
      </div>
      <div class="list">
        ${visible.length === 0 ? html`
          <div class="empty">
            ${this._annotations.length === 0
          ? html`No annotations yet.<br><span style="color:var(--wa-color-text-quiet)">Hold Alt+Shift and click any element in your app.</span>`
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
