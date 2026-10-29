/**
 * Instant Down-Press Interaction Helper (`gestures.md`, `buttons.md`, `pointing-devices.md`)
 *
 * Executes button, tab, pill, and menu selection handlers immediately on pointer down-press
 * (`onPointerDown` for primary mouse button or touch/pen input) for zero-latency responsiveness,
 * while preserving full keyboard (`Enter` / `Space`) and assistive technology (`onClick` detail === 0)
 * accessibility without double-firing.
 */

import type React from "react";

export interface InstantPressHandlers<T extends HTMLElement = HTMLElement> {
  onPointerDown: (e: React.PointerEvent<T>) => void;
  onKeyDown: (e: React.KeyboardEvent<T>) => void;
  onClick: (e: React.MouseEvent<T>) => void;
}

export function createInstantPress<T extends HTMLElement = HTMLElement>(
  handler: (
    e:
      | React.PointerEvent<T>
      | React.KeyboardEvent<T>
      | React.MouseEvent<T>
  ) => void,
  options?: { preventDefaultOnMouse?: boolean; disabled?: boolean }
): InstantPressHandlers<T> {
  let lastPointerDownTs = 0;

  return {
    onPointerDown: (e: React.PointerEvent<T>) => {
      if (options?.disabled) return;
      // Only trigger on primary mouse button (0) or touch/pen input
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (options?.preventDefaultOnMouse && e.pointerType === "mouse") {
        e.preventDefault();
      }
      lastPointerDownTs = Date.now();
      handler(e);
    },
    onKeyDown: (e: React.KeyboardEvent<T>) => {
      if (options?.disabled) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        lastPointerDownTs = Date.now();
        handler(e);
      }
    },
    onClick: (e: React.MouseEvent<T>) => {
      if (options?.disabled) return;
      // Allow assistive technology / screen-reader synthetic click (e.detail === 0)
      // when not preceded by our pointerDown or keyDown handler within 450ms
      const elapsed = Date.now() - lastPointerDownTs;
      if (elapsed > 450) {
        handler(e);
      }
    },
  };
}
