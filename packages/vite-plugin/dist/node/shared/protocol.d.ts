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
export interface AnnotationSource {
    file: string;
    line: number;
    column: number;
}
export interface Annotation {
    id: string;
    selectors: string[];
    labels: string[];
    comment: string;
    pageUrl: string;
    timestamp: number;
    source?: AnnotationSource;
}
export interface AnnotationUpsertMsg {
    type: 'annotation:upsert';
    payload: Annotation;
}
export interface AnnotationDeleteMsg {
    type: 'annotation:delete';
    payload: {
        id: string;
    };
}
export interface AnnotationClearMsg {
    type: 'annotation:clear';
}
export type BrowserMessage = TweakChangeMsg | TweakFinalizeMsg | TweakResetMsg | TweakResetAllMsg | TweakDiscardAllMsg | AnnotationUpsertMsg | AnnotationDeleteMsg | AnnotationClearMsg;
export interface TweakSchemaMsg {
    type: 'tweak:schema';
    payload: TweakKnob[];
}
export interface AnnotationsSyncMsg {
    type: 'annotations:sync';
    payload: Annotation[];
}
export interface InspectPickMsg {
    type: 'inspect:pick';
    payload: AnnotationSource;
}
export type ServerMessage = TweakSchemaMsg | AnnotationsSyncMsg | InspectPickMsg;
