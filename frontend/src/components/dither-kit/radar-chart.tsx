"use client";

import type { ReactNode } from "react";
import type { ChartConfig, Margins } from "./chart-context";
import type { BloomInput } from "./dither-paint";
import { PolarRoot } from "./polar-root";
import { RadarCanvas } from "./radar-canvas";
import { RadarFrame } from "./radar-frame";

type Row = object;

export type RadarChartProps<TData extends Row> = {
  data: TData[];
  config: ChartConfig;
  children: ReactNode;
  nameKey: string;
  margins?: Partial<Margins>;
  className?: string;
  animate?: boolean;
  animationDuration?: number;
  replayToken?: number;
  bloom?: BloomInput;
  bloomOnHover?: boolean;
  defaultSelectedDataKey?: string | null;
  onSelectionChange?: (key: string | null) => void;
};

export function RadarChart<TData extends Row>(props: RadarChartProps<TData>) {
  return (
    <PolarRoot
      chartType="radar"
      Canvas={RadarCanvas}
      backDecoration={<RadarFrame />}
      dataKey=""
      {...props}
    />
  );
}
