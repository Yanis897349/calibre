import { useEffect, useState } from "react";

/** Copies text and remembers which control triggered it for brief inline feedback. */
export function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!copied) return;

    const id = setTimeout(() => setCopied(null), 1600);

    return () => clearTimeout(id);
  }, [copied]);

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
    } catch {
      setCopied(null);
    }
  }

  return { copied, copy };
}
