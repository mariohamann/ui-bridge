// ─── Knob types ───────────────────────────────────────────────────────────────

export type TweakKnobType = 'number' | 'color' | 'string' | 'boolean' | 'select' | 'button-group';

export interface TweakKnob {
  marker: string;
  label: string;
  type: TweakKnobType;
  value: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: Record<string, string>;
  /** The annotation this tweak is linked to. Set by the MCP agent in meta.annotationId. */
  annotationId?: string;
}

// ─── Browser → Server ────────────────────────────────────────────────────────

export interface TweakChangeMsg {
  type: 'tweak:change';
  payload: { marker: string; value: string; };
}

export interface TweakFinalizeMsg {
  type: 'tweak:finalize';
  payload: { markers: string[]; };
}

export interface TweakResetMsg {
  type: 'tweak:reset';
  payload: { marker: string; };
}

export interface TweakResetAllMsg {
  type: 'tweak:reset-all';
}

export interface TweakAcceptAnnotationMsg {
  type: 'tweak:accept-annotation';
  payload: { annotationId: string; };
}

export interface TweakAcceptTweakMsg {
  type: 'tweak:accept-tweak';
  payload: { annotationId: string; marker: string; };
}

export interface TweakDismissMsg {
  type: 'tweak:dismiss';
  payload: { annotationId: string; marker: string; };
}

export type BrowserMessage =
  | TweakChangeMsg
  | TweakFinalizeMsg
  | TweakResetMsg
  | TweakResetAllMsg
  | TweakAcceptAnnotationMsg
  | TweakAcceptTweakMsg
  | TweakDismissMsg;

// ─── Server → Browser ────────────────────────────────────────────────────────

export interface TweakSchemaMsg {
  type: 'tweak:schema';
  payload: TweakKnob[];
}

export type ServerMessage = TweakSchemaMsg;
