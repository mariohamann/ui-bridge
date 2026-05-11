import type { Annotation } from '@design-bridge/core';

/**
 * Typed event bus for communication between bridge-annotation-item and
 * bridge-panel / inspector. Uses a shared EventTarget instead of bubbling
 * custom events through document, eliminating hidden coupling.
 */

export interface AnnotationBusEventMap {
  'annotation-save': CustomEvent<Annotation>;
  'annotation-cancel': CustomEvent<{ id: string; }>;
  'annotation-delete': CustomEvent<{ id: string; }>;
  'annotation-resolve': CustomEvent<{ id: string; }>;
  'annotation-accept-tweaks': CustomEvent<{ annotationId: string; }>;
  'tweak-accept': CustomEvent<{ annotationId: string; marker: string; }>;
  'tweak-dismiss': CustomEvent<{ annotationId: string; marker: string; }>;
}

class AnnotationBus extends EventTarget {
  emit<K extends keyof AnnotationBusEventMap>(
    type: K,
    detail: AnnotationBusEventMap[K] extends CustomEvent<infer D> ? D : never,
  ): void {
    this.dispatchEvent(new CustomEvent(type as string, { detail }));
  }

  on<K extends keyof AnnotationBusEventMap>(
    type: K,
    handler: (ev: AnnotationBusEventMap[K]) => void,
  ): void {
    this.addEventListener(type as string, handler as EventListener);
  }

  off<K extends keyof AnnotationBusEventMap>(
    type: K,
    handler: (ev: AnnotationBusEventMap[K]) => void,
  ): void {
    this.removeEventListener(type as string, handler as EventListener);
  }
}

export const annotationBus = new AnnotationBus();
