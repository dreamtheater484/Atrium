import { type ChartPalette, chartPalette, echartsTheme } from '@atrium/ui';
import { BarChart, LineChart, PieChart, ScatterChart, TreemapChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import { useEffect, useMemo, useRef } from 'react';
import { useTheme } from '../../lib/theme';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  TreemapChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  TitleComponent,
  MarkLineComponent,
  MarkAreaComponent,
  VisualMapComponent,
  SVGRenderer,
]);

export type EChartsOption = echarts.EChartsCoreOption;

/** Re-reads the design tokens whenever light/dark mode changes. */
export function usePalette(): ChartPalette {
  const { resolved } = useTheme();
  // biome-ignore lint/correctness/useExhaustiveDependencies: palette depends on the resolved theme class
  return useMemo(() => chartPalette(), [resolved]);
}

export function EChart({
  option,
  height = 260,
  onClick,
  className,
  ariaLabel,
}: {
  option: EChartsOption;
  height?: number | string;
  onClick?: (params: {
    name: string;
    data: unknown;
    dataIndex: number;
    seriesIndex: number;
  }) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const { resolved } = useTheme();
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  // biome-ignore lint/correctness/useExhaustiveDependencies: theme switch recreates the chart
  useEffect(() => {
    if (!ref.current) return;
    const theme = echartsTheme(chartPalette());
    const instance = echarts.init(ref.current, theme, { renderer: 'svg' });
    chart.current = instance;
    instance.on('click', (p) => clickRef.current?.(p as never));
    const ro = new ResizeObserver(() => instance.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, [resolved]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-apply option after theme change
  useEffect(() => {
    // People who ask for less motion (and screenshot tests) get charts without animation.
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    chart.current?.setOption({ animation: !still, animationDuration: 500, ...option }, true);
  }, [option, resolved]);

  return (
    <div
      ref={ref}
      role="img"
      aria-label={ariaLabel}
      className={className}
      style={{ height, width: '100%', cursor: onClick ? 'pointer' : undefined }}
    />
  );
}
