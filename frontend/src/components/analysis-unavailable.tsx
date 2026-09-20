import { RotateCcw } from "lucide-react";
import { BAYER4 } from "./dither-kit/pixel";
import { Button } from "./ui/button";

const signalPixels = Array.from({ length: 100 }, (_, x) => {
  const crest = 8 + 27 * Math.exp(-(((x - 43) / 23) ** 2));

  return Array.from({ length: 48 }, (_, y) => {
    const distance = Math.abs(y - 24);
    const density = Math.max(0, 1 - distance / crest) * 0.85;
    const interrupted = x > 53 && x < 62;
    const fade = Math.min(1, x / 18, (100 - x) / 22);

    return !interrupted && density * fade > BAYER4[y % 4][x % 4]
      ? `M${x * 4} ${y * 4}h2v2h-2z`
      : "";
  }).join("");
}).join("");

export function AnalysisUnavailable({
  message,
  pending,
  onRetry,
}: {
  message: string;
  pending: boolean;
  onRetry: () => void;
}) {
  return (
    <section className="connection-panel" aria-labelledby="connection-title">
      <div className="connection-body">
        <div className="connection-copy">
          <div role="alert" aria-atomic="true">
            <span className="connection-status">
              <span aria-hidden="true" />
              Analysis unavailable
            </span>
            <h2 id="connection-title">A break in the signal.</h2>
            <p>{message}</p>
          </div>
          <Button
            className="connection-retry"
            leadingIcon={RotateCcw}
            disabled={pending}
            onClick={onRetry}
          >
            {pending ? "Reconnecting…" : "Retry connection"}
          </Button>
          <span className="sr-only" role="status">
            {pending ? "Reconnecting to the server." : ""}
          </span>
        </div>
        <div className="connection-art" aria-hidden="true">
          <svg viewBox="0 0 400 192" fill="currentColor">
            <path d={signalPixels} />
            <path
              d="M232 12v168"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.3"
              strokeDasharray="2 6"
            />
            <path d="M228 7h8v8h-8zM228 177h8v8h-8z" />
          </svg>
          <span>Signal interrupted</span>
        </div>
      </div>
      <div className="connection-footer">
        <span className="connection-footer-mark" aria-hidden="true">
          ↳
        </span>
        Your filters are kept. Pick up where you left off.
      </div>
    </section>
  );
}
