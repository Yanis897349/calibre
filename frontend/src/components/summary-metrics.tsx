import { Crosshair } from "lucide-react";
import { type Analysis, num } from "../types";

export function SummaryMetrics({ data, dpi }: { data: Analysis; dpi: number }) {
  const summary = data.summary;

  const landmarks = summary
    ? [
        ...summary.range,
        ...(summary.confidence || []),
        summary.peak,
        summary.median,
      ]
    : [0, 1];

  const low = Math.min(...landmarks);
  const span = Math.max(Math.max(...landmarks) - low, 1);
  const position = (value: number) => 12 + ((value - low) / span) * 216;

  const density = Array.from({ length: 48 }, (_, index) => {
    const start = Math.floor((index / 48) * data.density.length);

    const end = Math.max(
      start + 1,
      Math.floor(((index + 1) / 48) * data.density.length),
    );

    return Math.max(
      0,
      ...data.density.slice(start, end).map((point) => point.density),
    );
  });

  const maxDensity = Math.max(...density, 0.000001);

  const sampleShare = effectiveSampleShare(summary);

  const ticks = Array.from({ length: 25 }, (_, index) => (
    <line
      key={index}
      x1={12 + index * 9}
      x2={12 + index * 9}
      y1={index % 4 === 0 ? 13 : 20}
      y2="33"
      className="metric-scale-tick"
    />
  ));

  return (
    <div className="metrics">
      <article className="metric recommended">
        <div className="metric-label">
          <span className="metric-index">01</span> Recommended sensitivity{" "}
          <Crosshair size={16} />
        </div>
        <div className="recommend-value">
          {num(summary?.normalized, 3)}
          <span>@ {num(dpi)} DPI</span>
        </div>
        <div className="metric-visual">
          <svg
            viewBox="0 0 240 44"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {density.map((value, index) => (
              <rect
                key={index}
                x={index * 5}
                y={42 - (value / maxDensity) * 36}
                width="2"
                height={Math.max(1, (value / maxDensity) * 36)}
                fill="currentColor"
              />
            ))}
          </svg>
          <span className="metric-visual-caption">
            The cohort’s strongest signal
          </span>
        </div>
        <div className="metric-foot">
          <strong>{summary ? num(summary.peak) : "—"} eDPI</strong>
          <span>Recommended peak</span>
        </div>
      </article>
      <article className="metric median-metric">
        <div className="metric-label">
          <span className="metric-index">02</span> Weighted median
        </div>
        <div className="metric-number">
          {summary ? num(summary.median / dpi, 3) : "—"}
          <span>sens</span>
        </div>
        <div className="metric-visual">
          <svg
            viewBox="0 0 240 44"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {ticks}
            {summary && (
              <>
                <line
                  x1={position(summary.median)}
                  x2={position(summary.median)}
                  y1="7"
                  y2="39"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d={`M ${position(summary.median) - 4} 3 h 8 l -4 5 z`}
                  fill="currentColor"
                />
              </>
            )}
          </svg>
          <span className="metric-visual-caption">
            Half the weight on either side
          </span>
        </div>
        <div className="metric-foot">
          <strong>{num(summary?.median)} eDPI</strong>
          <span>Center of the cohort</span>
        </div>
      </article>
      <article className="metric interval-metric">
        <div className="metric-label">
          <span className="metric-index">03</span> 95% peak interval
        </div>
        <div className="metric-number range">
          {summary?.confidence
            ? `${num(summary.confidence[0] / dpi, 3)} – ${num(summary.confidence[1] / dpi, 3)}`
            : "Insufficient data"}
        </div>
        <div className="metric-visual">
          <svg
            viewBox="0 0 240 44"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <line
              x1="12"
              x2="228"
              y1="23"
              y2="23"
              className="metric-scale-tick"
            />
            {summary?.confidence && (
              <>
                <rect
                  x={position(summary.confidence[0])}
                  y="15"
                  width={Math.max(
                    1,
                    position(summary.confidence[1]) -
                      position(summary.confidence[0]),
                  )}
                  height="16"
                  fill="currentColor"
                  opacity="0.2"
                />
                {summary.confidence.map((value, index) => (
                  <line
                    key={index}
                    x1={position(value)}
                    x2={position(value)}
                    y1="11"
                    y2="35"
                    stroke="currentColor"
                  />
                ))}
                <circle
                  cx={position(summary.peak)}
                  cy="23"
                  r="4"
                  fill="currentColor"
                />
              </>
            )}
          </svg>
          <span className="metric-visual-caption">
            {summary?.confidence
              ? "A range around the recommendation"
              : "More observations needed"}
          </span>
        </div>
        <div className="metric-foot">
          <strong>
            {summary?.confidence ? "95% confidence" : "Interval unavailable"}
          </strong>
          <span>Bootstrap uncertainty</span>
        </div>
      </article>
      <article className="metric sample-metric">
        <div className="metric-label">
          <span className="metric-index">04</span> Effective sample
        </div>
        <div className="metric-number">
          {num(summary?.effective_sample, 1)}
          <span>players</span>
        </div>
        <div className="metric-visual">
          <svg
            viewBox="0 0 240 44"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {Array.from({ length: 60 }, (_, index) => (
              <rect
                key={index}
                x={3 + (index % 20) * 12}
                y={7 + Math.floor(index / 20) * 12}
                width="5"
                height="5"
                rx="1"
                fill="currentColor"
                opacity={index < Math.round(sampleShare * 60) ? 1 : 0.15}
              />
            ))}
          </svg>
          <span className="metric-visual-caption">
            From {num(summary?.sample_size ?? data.players.length)} observed
            players
          </span>
        </div>
        <div className="metric-foot">
          <strong>
            {num(data.players.reduce((sum, player) => sum + player.maps, 0))}{" "}
            maps
          </strong>
          <span>Analyzed in this cohort</span>
        </div>
      </article>
    </div>
  );
}

function effectiveSampleShare(summary: Analysis["summary"]) {
  return summary && summary.sample_size > 0
    ? Math.min(1, Math.max(0, summary.effective_sample / summary.sample_size))
    : 0;
}
