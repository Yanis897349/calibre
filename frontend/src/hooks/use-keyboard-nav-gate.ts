"use client";

import { useCallback, useEffect, useRef, type KeyboardEvent } from "react";
import { POPUP_NAV_KEYS } from "@/lib/popup";

/* Popup autofocus can inherit :focus-visible; show focus rings only after keyboard input. */
export function useKeyboardNavGate(open: boolean) {
  const keyboardNavRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    keyboardNavRef.current =
      active instanceof HTMLElement && active.matches(":focus-visible");
  }, [open]);

  const trackKeyboardNav = useCallback((e: KeyboardEvent) => {
    if (POPUP_NAV_KEYS.includes(e.key)) keyboardNavRef.current = true;
  }, []);

  return { keyboardNavRef, trackKeyboardNav };
}
