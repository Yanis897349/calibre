import { useId, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { PlayerPointPreview } from "./components/player-point-preview";
import { AreaChart, LineChart } from "./components/dither-kit/area-chart";
import { Area, Line } from "./components/dither-kit/area";
import { BarChart } from "./components/dither-kit/bar-chart";
import { Bar } from "./components/dither-kit/bar";
import { Grid } from "./components/dither-kit/grid";
import { XAxis } from "./components/dither-kit/x-axis";
import { YAxis } from "./components/dither-kit/y-axis";
import { Tooltip } from "./components/dither-kit/tooltip";
import { RadarChart } from "./components/dither-kit/radar-chart";
import { Radar } from "./components/dither-kit/radar";
import { useChartPart } from "./components/dither-kit/chart-context";
import type { DitherColor } from "./components/dither-kit/palette";
import {
  type Analysis,
  type Comparison,
  type Player,
  type Mechanical,
  mechanics,
  num,
  colors,
} from "./types";

const chartColors: DitherColor[] = [
  "green",
  "purple",
  "blue",
  "orange",
  "pink",
  "red",
  "grey",
];

function Peak({
  edpi,
  range,
  dpi,
  unit,
}: {
  edpi: number;
  range: [number, number] | null;
  dpi: number;
  unit: string;
}) {
  const c = useChartPart("Peak");

  if (!c.ready) return null;

  const index = (v: number) =>
    c.data.reduce(
      (best, row, i) =>
        Math.abs(Number(row.edpi) - v) < Math.abs(Number(c.data[best].edpi) - v)
          ? i
          : best,
      0,
    );

  const x = c.xCenter(index(edpi));
  const labelX = Math.max(0, Math.min(x - 47, c.plot.width - 94));

  return (
    <g pointerEvents="none">
      {range && (
        <rect
          x={c.xCenter(index(range[0]))}
          width={Math.max(
            0,
            c.xCenter(index(range[1])) - c.xCenter(index(range[0])),
          )}
          y={0}
          height={c.plot.height}
          fill="#c2ec79"
          opacity=".045"
        />
      )}
      <line
        x1={x}
        x2={x}
        y1={4}
        y2={c.plot.height}
        stroke="#c4ef83"
        strokeDasharray="4 5"
        opacity=".75"
      />
      <rect
        x={labelX}
        y={1}
        width={94}
        height={24}
        rx={4}
        fill="#2d3923"
        stroke="#475a32"
      />
      <text
        x={labelX + 47}
        y={17}
        textAnchor="middle"
        fill="#c9f48b"
        fontFamily="monospace"
        fontSize={10}
      >
        PEAK {num(edpi / (unit === "edpi" ? 1 : dpi), unit === "edpi" ? 0 : 3)}
      </text>
    </g>
  );
}

export function Distribution({
  data,
  dpi,
  unit = "sensitivity",
  histogram = false,
  raw = false,
}: {
  data: Analysis;
  dpi: number;
  unit?: string;
  histogram?: boolean;
  raw?: boolean;
}) {
  const reduced = useReducedMotion();
  const divisor = unit === "edpi" ? 1 : dpi;

  if (!data.summary)
    return (
      <div className="chart-empty">
        No density to display. Try a broader cohort.
      </div>
    );

  if (histogram)
    return (
      <div
        role="img"
        aria-label="Weighted sensitivity histogram"
        className="chart-wrap"
      >
        <BarChart
          data={data.histogram.map((p) => ({
            ...p,
            label: num(p.edpi / divisor, unit === "edpi" ? 0 : 3),
          }))}
          config={{ weight: { label: "Statistical weight", color: "green" } }}
          className="h-full w-full"
          animate={!reduced}
        >
          <Grid />
          <Bar dataKey="weight" variant="dotted" />
          <XAxis dataKey="label" maxTicks={8} />
          <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} />
          <Tooltip
            labelKey="label"
            valueFormatter={(v) => `${(v * 100).toFixed(1)}%`}
          />
        </BarChart>
      </div>
    );

  return (
    <div
      role="img"
      aria-label={`Weighted sensitivity distribution. Peak ${num(data.summary.peak / divisor, 3)}, ${data.summary.sample_size} players.`}
      className="chart-wrap"
    >
      <AreaChart
        data={data.density.map((p) => ({
          ...p,
          label: num(p.edpi / divisor, unit === "edpi" ? 0 : 3),
        }))}
        config={
          raw
            ? {
                density: { label: "Regularized density", color: "green" },
                raw: { label: "Raw subgroup", color: "purple" },
              }
            : { density: { label: "Regularized density", color: "green" } }
        }
        className="h-full w-full"
        animate={!reduced}
        margins={{ top: 34, left: 38, bottom: 28, right: 16 }}
      >
        <Grid />
        <Area dataKey="density" variant="dotted" />
        {raw && <Area dataKey="raw" variant="hatched" strokeVariant="dashed" />}
        <XAxis dataKey="label" maxTicks={9} />
        <YAxis tickFormatter={(v) => (v * 100).toFixed(1)} />
        <Peak
          edpi={data.summary.peak}
          range={data.summary.confidence}
          dpi={dpi}
          unit={unit}
        />
        <Tooltip labelKey="label" valueFormatter={(v) => v.toFixed(4)} />
      </AreaChart>
    </div>
  );
}

export function MiniDensity({
  group,
  index,
}: {
  group: Comparison;
  index: number;
}) {
  const reduced = useReducedMotion();

  return (
    <AreaChart
      data={group.density.map((d) => ({ density: d }))}
      config={{ density: { color: chartColors[index % 7] } }}
      className="mini-chart"
      animate={!reduced}
      interactive={false}
      margins={{ top: 3, left: 0, bottom: 0, right: 0 }}
    >
      <Area dataKey="density" variant="dotted" />
    </AreaChart>
  );
}

export function CompareChart({
  data,
  groups,
  dpi,
}: {
  data: Analysis;
  groups: Comparison[];
  dpi: number;
}) {
  const reduced = useReducedMotion();

  const rows = data.density.map((p, i) =>
    Object.assign(
      { edpi: p.edpi, label: num(p.edpi / dpi, 3) },
      ...groups.map((g, k) => ({ ["g" + k]: g.density[i] })),
    ),
  );

  return (
    <div
      className="comparison-chart"
      role="img"
      aria-label="Sensitivity density comparison"
    >
      <LineChart
        data={rows}
        config={Object.fromEntries(
          groups.map((g, k) => [
            "g" + k,
            { label: g.name, color: chartColors[k % 7] },
          ]),
        )}
        className="h-full w-full"
        animate={!reduced}
      >
        <Grid />
        {groups.map((g, k) => (
          <Line key={g.name} dataKey={"g" + k} />
        ))}
        <XAxis dataKey="label" />
        <YAxis tickFormatter={(v) => (v * 100).toFixed(1)} />
        <Tooltip labelKey="label" valueFormatter={(v) => v.toFixed(4)} />
      </LineChart>
    </div>
  );
}

export function MechanicalRadar({ profile }: { profile: Mechanical }) {
  const reduced = useReducedMotion();

  return (
    <div
      role="img"
      aria-label={mechanics
        .map(([k, l]) => `${l}: ${Math.round(profile[k] * 100)}%`)
        .join(", ")}
    >
      <RadarChart
        data={mechanics.map(([key, label]) => ({
          label: label.split(" ")[0],
          score: profile[key] * 100,
          bound: 100,
        }))}
        nameKey="label"
        config={{
          score: { label: "Mechanical score", color: "green" },
          bound: { label: "Scale", color: "grey" },
        }}
        className="radar-chart"
        animate={!reduced}
      >
        <Radar dataKey="score" variant="dotted" />
      </RadarChart>
    </div>
  );
}

export function Scatter({
  players,
  axis,
  dpi,
  onPlayer,
}: {
  players: Player[];
  axis: "performance" | keyof Mechanical;
  dpi: number;
  onPlayer: (p: Player) => void;
}) {
  const max = Math.max(600, ...players.map((p) => p.edpi));
  const previewId = useId();

  const [preview, setPreview] = useState<{
    id: string;
    anchor: SVGCircleElement;
  } | null>(null);

  const previewPlayer = players.find((player) => player.id === preview?.id);

  const openPlayer = (player: Player) => {
    setPreview(null);
    onPlayer(player);
  };

  return (
    <div className="scatter">
      <svg
        viewBox="0 0 740 240"
        role="group"
        aria-label={`Sensitivity at ${dpi} DPI versus ${axis} scatter plot`}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line
              x1="48"
              x2="720"
              y1={205 - t * 175}
              y2={205 - t * 175}
              stroke="#2b2e30"
              strokeDasharray="3 5"
            />
            <text
              x="35"
              y={209 - t * 175}
              textAnchor="end"
              fill="#8b8d93"
              fontSize="10"
            >
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <text
            key={i}
            x={48 + (i / 5) * 670}
            y="226"
            textAnchor="middle"
            fill="#8b8d93"
            fontSize="10"
          >
            {num(((i / 5) * max) / dpi, 2)}
          </text>
        ))}
        {players.map((p) => (
          <circle
            key={p.id}
            cx={48 + (p.edpi / max) * 670}
            cy={
              205 -
              (axis === "performance" ? p.performance : p.mechanical[axis]) *
                175
            }
            r={3 + Math.sqrt(p.contribution) * 15}
            fill={colors.get(p.role)}
            opacity=".75"
            tabIndex={0}
            role="button"
            aria-label={`${p.name}, ${num(p.edpi)} eDPI`}
            aria-describedby={preview?.id === p.id ? previewId : undefined}
            className={
              preview?.id === p.id ? "point-preview-active" : undefined
            }
            onPointerEnter={(event) => {
              if (event.pointerType !== "touch")
                setPreview({ id: p.id, anchor: event.currentTarget });
            }}
            onPointerLeave={(event) => {
              if (document.activeElement !== event.currentTarget)
                setPreview(null);
            }}
            onFocus={(event) =>
              setPreview({ id: p.id, anchor: event.currentTarget })
            }
            onBlur={() => setPreview(null)}
            onClick={() => openPlayer(p)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setPreview(null);

              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openPlayer(p);
              }
            }}
          />
        ))}
      </svg>
      {preview && previewPlayer && (
        <PlayerPointPreview
          id={previewId}
          player={previewPlayer}
          anchor={preview.anchor}
          axis={axis}
          dpi={dpi}
        />
      )}
    </div>
  );
}
