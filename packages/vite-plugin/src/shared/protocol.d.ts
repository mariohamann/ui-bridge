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
}
export interface TweakChangeMsg {
  type: 'tweak:change';
  payload: {
    marker: string;
    value: string;
  };
}
export interface TweakFinalizeMsg {
  type: 'tweak:finalize';
  payload: {
    markers: string[];
  };
}
export interface TweakResetMsg {
  type: 'tweak:reset';
  payload: {
    marker: string;
  };
}
export interface TweakResetAllMsg {
  type: 'tweak:reset-all';
}
export interface TweakDiscardAllMsg {
  type: 'tweak:discard-all';
}
export type BrowserMessage = TweakChangeMsg | TweakFinalizeMsg | TweakResetMsg | TweakResetAllMsg | TweakDiscardAllMsg;
export interface TweakSchemaMsg {
  type: 'tweak:schema';
  payload: TweakKnob[];
}
export type ServerMessage = TweakSchemaMsg;
