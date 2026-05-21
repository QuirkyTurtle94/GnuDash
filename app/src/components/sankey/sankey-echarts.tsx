"use client";

import { useRef, useCallback, useState, useMemo, useEffect } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { SankeyChart } from "echarts/charts";
import { TooltipComponent } from "echarts/components";
import { SVGRenderer, CanvasRenderer } from "echarts/renderers";
import { Maximize2, Minimize2, Minus, Plus, RotateCcw } from "lucide-react";
import type { EChartsSankeyData } from "@/lib/sankey-utils";
import { formatCurrencyShort } from "@/lib/format";

echarts.use([SankeyChart, TooltipComponent, SVGRenderer, CanvasRenderer]);

const NODE_MIN_HEIGHT = 30;
const NODE_GAP = 12;
const PX_PER_NODE = NODE_MIN_HEIGHT + NODE_GAP + 16;
const CHART_PADDING = 40;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.1;
const MINOR_NODE_SHARE = 0.02;
const MINOR_NODE_LIMIT = 10;

function formatRichText(value: string): string {
  return value.replace(/[{}|]/g, " ");
}

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

function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}

function computeNodeValues(data: EChartsSankeyData): Map<string, number> {
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();

  for (const link of data.links) {
    outgoing.set(link.source, (outgoing.get(link.source) ?? 0) + link.value);
    incoming.set(link.target, (incoming.get(link.target) ?? 0) + link.value);
  }

  const values = new Map<string, number>();
  for (const node of data.nodes) {
    values.set(node.name, Math.max(incoming.get(node.name) ?? 0, outgoing.get(node.name) ?? 0));
  }

  return values;
}

function computeTerminalNodeNames(data: EChartsSankeyData): Set<string> {
  const sourceOf = new Set<string>();
  const targetOf = new Set<string>();

  for (const link of data.links) {
    sourceOf.add(link.source);
    targetOf.add(link.target);
  }

  return new Set(data.nodes.filter((node) => targetOf.has(node.name) && !sourceOf.has(node.name)).map((node) => node.name));
}

function isAggregateNode(name: string): boolean {
  return (
    name === "total-income" ||
    name === "total-expenses" ||
    name === "total-inflow" ||
    name === "total-outflow" ||
    name === "net-cashflow"
  );
}

interface SankeyEChartsProps {
  data: EChartsSankeyData;
  currency: string;
  /** Extra controls rendered on the left side of the bottom bar */
  bottomBarLeft?: React.ReactNode;
}

export function SankeyECharts({ data, currency, bottomBarLeft }: SankeyEChartsProps) {
  const chartRef = useRef<ReactEChartsCore>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previousScaleRef = useRef(1);
  const [containerBoxHeight, setContainerBoxHeight] = useState(600);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [viewportWidth, setViewportWidth] = useState(800);
  const [zoom, setZoom] = useState(1);
  const [isExpanded, setIsExpanded] = useState(false);

  const idealHeight = useMemo(() => computeIdealHeight(data), [data]);
  const nodeValues = useMemo(() => computeNodeValues(data), [data]);
  const terminalNodeNames = useMemo(() => computeTerminalNodeNames(data), [data]);
  const minorNodes = useMemo(() => {
    const largestNodeValue = Math.max(...Array.from(nodeValues.values()), 0);
    if (largestNodeValue <= 0) return [];

    return data.nodes
      .map((node) => ({
        name: node.name,
        label: node.displayLabel,
        value: nodeValues.get(node.name) ?? 0,
        color: node.itemStyle.color,
      }))
      .filter((node) => !isAggregateNode(node.name) && node.value > 0 && node.value / largestNodeValue <= MINOR_NODE_SHARE)
      .sort((a, b) => b.value - a.value)
      .slice(0, MINOR_NODE_LIMIT);
  }, [data.nodes, nodeValues]);

  useEffect(() => {
    function measure() {
      const el = containerRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const borderX = parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
      const borderY = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      const available = window.innerHeight - rect.top - 80;
      const nextBoxHeight = Math.max(300, Math.floor(available));

      setContainerBoxHeight(nextBoxHeight);
      setViewportHeight(Math.max(0, Math.floor(nextBoxHeight - borderY)));
      setViewportWidth(Math.max(300, Math.floor(el.clientWidth || rect.width - borderX)));
    }

    measure();
    const resizeObserver = new ResizeObserver(measure);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    window.addEventListener("resize", measure);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [isExpanded]);

  const autoScale = Math.min(1, viewportHeight / idealHeight);
  const effectiveScale = autoScale * zoom;
  const chartBaseWidth = viewportWidth / autoScale;
  const scaledChartWidth = chartBaseWidth * effectiveScale;
  const scaledChartHeight = idealHeight * effectiveScale;

  // The CSS `transform: scale(effectiveScale)` on the inner container shrinks
  // every child proportionally — including SVG labels. When autoScale < 1
  // (common at HD-ready resolutions where containerHeight < idealHeight), a
  // 12px base label renders at effective ~6px and becomes unreadable. Compute
  // a pre-inflated base so that after the CSS scale it lands back at ~12px.
  // Only compensate for autoScale, not user-driven `zoom` — zoom should scale
  // visibly, which is the whole point of it.
  const LABEL_BASE_PX = 12;
  const compensatedLabelFontSize = Math.ceil(LABEL_BASE_PX / autoScale);
  const compensatedLabelLineHeight = Math.ceil(15 / autoScale);
  const compensatedStackedLabelWidth = Math.ceil(160 / autoScale);
  const compensatedInlineLabelNameWidth = Math.ceil(112 / autoScale);
  const compensatedInlineLabelValueWidth = Math.ceil(64 / autoScale);

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

  useEffect(() => {
    if (!isExpanded) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsExpanded(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isExpanded]);

  // Zoom on Shift+scroll only — normal scroll passes through to the page
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      if (!e.shiftKey) return; // let normal scroll pass through
      e.preventDefault();
      setZoom((prev) => {
        const delta = e.deltaY > 0 ? -ZOOM_STEP / 2 : ZOOM_STEP / 2;
        return clampZoom(prev + delta);
      });
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    const previousScale = previousScaleRef.current;
    if (!el || previousScale === effectiveScale) {
      previousScaleRef.current = effectiveScale;
      return;
    }

    const ratio = effectiveScale / previousScale;
    const centerX = el.scrollLeft + el.clientWidth / 2;
    const centerY = el.scrollTop + el.clientHeight / 2;
    el.scrollLeft = centerX * ratio - el.clientWidth / 2;
    el.scrollTop = centerY * ratio - el.clientHeight / 2;
    previousScaleRef.current = effectiveScale;
  }, [effectiveScale]);

  const resetZoom = useCallback(() => setZoom(1), []);

  useEffect(() => {
    const instance = chartRef.current?.getEchartsInstance();
    if (!instance) return;

    const frameId = window.requestAnimationFrame(() => {
      instance.resize();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [viewportHeight, viewportWidth, isExpanded]);

  const option: echarts.EChartsCoreOption = {
    tooltip: {
      trigger: "item",
      triggerOn: "mousemove",
      // Render the tooltip as a body-level element so the parent container's
      // CSS `transform: scale(...)` doesn't shrink it along with the chart
      // (issue #97 — tooltip became unreadable at HD-ready where autoScale
      // drops below ~0.5).
      appendToBody: true,
      textStyle: { fontSize: 13 },
      extraCssText: "font-size: 13px; line-height: 1.4;",
      formatter: (params: Record<string, unknown>) => {
        const d = params.data as Record<string, unknown> | undefined;
        if (!d) return "";

        if (d.source && d.target) {
          const sourceLabel = data.nodes.find((n) => n.name === d.source)?.displayLabel ?? d.source;
          const targetLabel = data.nodes.find((n) => n.name === d.target)?.displayLabel ?? d.target;
          return `<strong>${sourceLabel} → ${targetLabel}</strong><br/>Amount: ${Number(d.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
        }

        if (d.name) {
          const label = (d as Record<string, unknown>).displayLabel ?? d.name;
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
        labelLayout: {
          moveOverlap: "shiftY",
          hideOverlap: true,
        },
        label: {
          fontFamily: "Inter, system-ui, sans-serif",
          color: "#6F767E",
          formatter: (params: { data?: { displayLabel?: string; name?: string }; value?: number }) => {
            const name = params.data?.name ?? "";
            const label = params.data?.displayLabel ?? params.data?.name ?? "";
            const value = params.value ?? 0;
            const richLabel = formatRichText(label);
            const richValue = formatRichText(formatCurrencyShort(value, currency));

            if (terminalNodeNames.has(name)) {
              return `{nodeNameInline|${richLabel}} {nodeValueInline|${richValue}}`;
            }

            return `{nodeNameStacked|${richLabel}}\n{nodeValueStacked|${richValue}}`;
          },
          rich: {
            nodeNameStacked: {
              color: "#4C5661",
              fontSize: compensatedLabelFontSize,
              fontWeight: 500,
              lineHeight: compensatedLabelLineHeight,
              width: compensatedStackedLabelWidth,
              overflow: "truncate",
            },
            nodeValueStacked: {
              color: "#9A9FA5",
              fontSize: Math.max(10, Math.round(compensatedLabelFontSize * 0.9)),
              fontWeight: 500,
              lineHeight: compensatedLabelLineHeight,
              width: compensatedStackedLabelWidth,
              overflow: "truncate",
            },
            nodeNameInline: {
              color: "#4C5661",
              fontSize: compensatedLabelFontSize,
              fontWeight: 500,
              lineHeight: compensatedLabelLineHeight,
              width: compensatedInlineLabelNameWidth,
              overflow: "truncate",
            },
            nodeValueInline: {
              color: "#9A9FA5",
              fontSize: Math.max(10, Math.round(compensatedLabelFontSize * 0.9)),
              fontWeight: 500,
              lineHeight: compensatedLabelLineHeight,
              width: compensatedInlineLabelValueWidth,
              overflow: "truncate",
            },
          },
        },
      },
    ],
  };

  return (
    <div className={isExpanded ? "fixed inset-0 z-50 flex flex-col bg-white p-4" : "relative"}>
      <div
        ref={containerRef}
        className="overflow-auto rounded-lg border border-[#EFEFEF] bg-white"
        style={{ height: `${containerBoxHeight}px` }}
      >
        <div
          style={{
            width: `${scaledChartWidth}px`,
            height: `${scaledChartHeight}px`,
            position: "relative",
          }}
        >
          <div
            style={{
              width: `${chartBaseWidth}px`,
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
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="min-w-12 whitespace-nowrap text-xs text-[#9A9FA5]">
            {zoom !== 1
              ? `${Math.round(effectiveScale * 100)}%`
              : autoScale < 1
                ? `Fit ${Math.round(autoScale * 100)}% · Shift + scroll to zoom`
                : "Shift + scroll to zoom"}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setZoom((prev) => clampZoom(prev - ZOOM_STEP))}
              disabled={zoom <= ZOOM_MIN}
              title="Zoom out"
              aria-label="Zoom out"
              className="flex h-7 w-7 items-center justify-center rounded border border-[#EFEFEF] text-[#6F767E] transition-colors hover:bg-[#F4F5F7] disabled:cursor-default disabled:opacity-30"
            >
              <Minus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <input
              aria-label="Sankey zoom"
              type="range"
              min={ZOOM_MIN * 100}
              max={ZOOM_MAX * 100}
              step={ZOOM_STEP * 100}
              value={Math.round(zoom * 100)}
              onChange={(event) => setZoom(clampZoom(Number(event.target.value) / 100))}
              className="h-7 w-28 accent-[#6C9B8B] sm:w-32"
            />
            <button
              type="button"
              onClick={() => setZoom((prev) => clampZoom(prev + ZOOM_STEP))}
              disabled={zoom >= ZOOM_MAX}
              title="Zoom in"
              aria-label="Zoom in"
              className="flex h-7 w-7 items-center justify-center rounded border border-[#EFEFEF] text-[#6F767E] transition-colors hover:bg-[#F4F5F7] disabled:cursor-default disabled:opacity-30"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          {zoom !== 1 && (
            <button
              type="button"
              onClick={resetZoom}
              title="Reset zoom"
              className="flex h-7 items-center gap-1 rounded border border-[#EFEFEF] px-2 text-xs text-[#6F767E] transition-colors hover:bg-[#F4F5F7]"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Reset
            </button>
          )}
          {bottomBarLeft && (
            <>
              <div className="h-4 w-px bg-[#EFEFEF]" />
              {bottomBarLeft}
            </>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
            title={isExpanded ? "Minimize Sankey" : "Expand Sankey"}
            aria-label={isExpanded ? "Minimize Sankey" : "Expand Sankey"}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#EFEFEF] text-[#6F767E] transition-colors hover:bg-[#F4F5F7]"
          >
            {isExpanded ? (
              <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
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

      {minorNodes.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[#EFEFEF] pt-3">
          <span className="text-xs font-medium text-[#6F767E]">Small items</span>
          {minorNodes.map((node) => (
            <span key={node.name} className="inline-flex items-center gap-1.5 text-xs text-[#6F767E]">
              <span
                className="h-2 w-2 rounded-sm"
                style={{ backgroundColor: node.color }}
                aria-hidden="true"
              />
              <span>{node.label}</span>
              <span className="text-[#9A9FA5]">{formatCurrencyShort(node.value, currency)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
