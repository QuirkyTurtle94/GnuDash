"use client";

import { useRef, useCallback, useState, useMemo, useEffect } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { SankeyChart } from "echarts/charts";
import { TooltipComponent } from "echarts/components";
import { SVGRenderer, CanvasRenderer } from "echarts/renderers";
import type { EChartsSankeyData } from "@/lib/sankey-utils";
import { formatCurrencyShort } from "@/lib/format";

echarts.use([SankeyChart, TooltipComponent, SVGRenderer, CanvasRenderer]);

const NODE_MIN_HEIGHT = 30;
const NODE_GAP = 12;
const PX_PER_NODE = NODE_MIN_HEIGHT + NODE_GAP + 16;
const CHART_PADDING = 40;

function computeIdealHeight(data: EChartsSankeyData): number {
  const targetOf = new Set<string>();
  const sourceOf = new Set<string>();
  for (const l of data.links) {
    sourceOf.add(l.source);
    targetOf.add(l.target);
  }

  const columnCounts = new Map<number, number>();
  for (const node of data.nodes) {
    let col: number;
    if (node.depth !== undefined) {
      col = node.depth;
    } else if (!targetOf.has(node.name)) {
      col = 0;
    } else if (!sourceOf.has(node.name)) {
      col = 3;
    } else {
      col = 1;
    }
    columnCounts.set(col, (columnCounts.get(col) ?? 0) + 1);
  }

  const maxNodesInColumn = Math.max(...columnCounts.values(), 1);
  return Math.max(400, maxNodesInColumn * PX_PER_NODE + CHART_PADDING);
}

interface SankeyEChartsProps {
  data: EChartsSankeyData;
  currency: string;
}

export function SankeyECharts({ data, currency }: SankeyEChartsProps) {
  const chartRef = useRef<ReactEChartsCore>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(600);
  const [zoom, setZoom] = useState(1);

  const idealHeight = useMemo(() => computeIdealHeight(data), [data]);

  useEffect(() => {
    function measure() {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const available = window.innerHeight - rect.top - 80;
      setContainerHeight(Math.max(300, available));
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const autoScale = Math.min(1, containerHeight / idealHeight);
  const effectiveScale = autoScale * zoom;
  const visibleHeight = idealHeight * effectiveScale;

  const exportImage = useCallback(
    (format: "png" | "svg") => {
      const instance = chartRef.current?.getEchartsInstance();
      if (!instance) return;

      const url = instance.getDataURL({
        type: format === "svg" ? "svg" : "png",
        pixelRatio: 2,
        backgroundColor: "#fff",
      });

      const a = document.createElement("a");
      a.href = url;
      a.download = `sankey-cashflow-${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
    },
    [],
  );

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom((prev) => {
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      return Math.min(3, Math.max(0.5, prev + delta));
    });
  }, []);

  const resetZoom = useCallback(() => setZoom(1), []);

  const option: echarts.EChartsCoreOption = {
    tooltip: {
      trigger: "item",
      triggerOn: "mousemove",
      formatter: (params: Record<string, unknown>) => {
        const d = params.data as Record<string, unknown> | undefined;
        if (!d) return "";

        if (d.source && d.target) {
          const sourceLabel = data.nodes.find((n) => n.name === d.source)?.label ?? d.source;
          const targetLabel = data.nodes.find((n) => n.name === d.target)?.label ?? d.target;
          return `<strong>${sourceLabel} → ${targetLabel}</strong><br/>Amount: ${Number(d.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
        }

        if (d.name) {
          const label = (d as Record<string, unknown>).label ?? d.name;
          const value = (params.value as number) ?? 0;
          return `<strong>${label}</strong><br/>Total: ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
        }

        return "";
      },
    },
    series: [
      {
        type: "sankey",
        layoutIterations: 32,
        draggable: true,
        emphasis: {
          focus: "adjacency",
        },
        orient: "horizontal",
        nodeAlign: "left",
        nodeGap: NODE_GAP,
        nodeWidth: 24,
        nodeMinHeight: NODE_MIN_HEIGHT,
        data: data.nodes,
        links: data.links,
        lineStyle: {
          curveness: 0.5,
        },
        label: {
          fontSize: 12,
          fontFamily: "Inter, system-ui, sans-serif",
          color: "#6F767E",
          formatter: (params: { data?: { label?: string; name?: string }; value?: number }) => {
            const label = params.data?.label ?? params.data?.name ?? "";
            const value = params.value ?? 0;
            return `${label}\n${formatCurrencyShort(value, currency)}`;
          },
        },
      },
    ],
  };

  return (
    <div>
      <div
        ref={containerRef}
        onWheel={handleWheel}
        className="overflow-hidden rounded-lg"
        style={{ height: `${visibleHeight}px` }}
      >
        <div
          style={{
            width: `${100 / effectiveScale}%`,
            height: `${idealHeight}px`,
            transform: `scale(${effectiveScale})`,
            transformOrigin: "top left",
          }}
        >
          <ReactEChartsCore
            ref={chartRef}
            echarts={echarts}
            option={option}
            style={{ height: "100%", width: "100%" }}
            opts={{ renderer: "svg" }}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#9A9FA5]">
            {zoom !== 1
              ? `${Math.round(effectiveScale * 100)}%`
              : autoScale < 1
                ? `Fit ${Math.round(autoScale * 100)}% · Ctrl + scroll to zoom`
                : "Ctrl + scroll to zoom"}
          </span>
          {zoom !== 1 && (
            <button
              onClick={resetZoom}
              className="rounded-lg border border-[#EFEFEF] px-2 py-1 text-xs text-[#6F767E] transition-colors hover:bg-[#F4F5F7]"
            >
              Reset
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportImage("png")}
            className="rounded-lg border border-[#EFEFEF] px-3 py-1.5 text-xs text-[#6F767E] transition-colors hover:bg-[#F4F5F7]"
          >
            Export PNG
          </button>
          <button
            onClick={() => exportImage("svg")}
            className="rounded-lg border border-[#EFEFEF] px-3 py-1.5 text-xs text-[#6F767E] transition-colors hover:bg-[#F4F5F7]"
          >
            Export SVG
          </button>
        </div>
      </div>
    </div>
  );
}
