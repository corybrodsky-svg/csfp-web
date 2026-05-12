"use client";

import { useEffect } from "react";

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const editable = target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']");
  if (editable) return true;
  return Boolean(target.isContentEditable);
}

export default function KeyboardInputGuard() {
  useEffect(() => {
    function preserveEditableSpace(event: KeyboardEvent) {
      if (event.key !== " " && event.code !== "Space") return;
      if (!isEditableTarget(event.target)) return;
      event.stopPropagation();
    }

    window.addEventListener("keydown", preserveEditableSpace, { capture: true });
    return () => window.removeEventListener("keydown", preserveEditableSpace, { capture: true });
  }, []);

  return null;
}
