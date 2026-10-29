"use client";

import React from "react";
import { createInstantPress } from "@/lib/instant-press";
import type { InspectorTabId } from "@/lib/types";

interface SegmentedInspectorProps {
  activeTab: InspectorTabId;
  onSelectTab: (tab: InspectorTabId) => void;
  homeTla: string;
  awayTla: string;
  homeSeriesColor: string;
  awaySeriesColor: string;
  homeContrastRatio: number;
  awayContrastRatio: number;
}

const SEGMENTS: { id: InspectorTabId; label: string }[] = [
  {
    id: "matrix-markets",
    label: "Score Matrix & Markets",
  },
  {
    id: "telemetry-radar",
    label: "Match Telemetry & Radar",
  },
  {
    id: "xai-h2h",
    label: "Key Drivers & History",
  },
];

export function SegmentedInspector({
  activeTab,
  onSelectTab,
  homeTla,
  awayTla,
  homeSeriesColor,
  awaySeriesColor,
  homeContrastRatio,
  awayContrastRatio,
}: SegmentedInspectorProps) {
  const activeIndex = Math.max(
    0,
    SEGMENTS.findIndex((s) => s.id === activeTab)
  );

  const handleKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = SEGMENTS[(idx + 1) % SEGMENTS.length];
      onSelectTab(next.id);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = SEGMENTS[(idx - 1 + SEGMENTS.length) % SEGMENTS.length];
      onSelectTab(prev.id);
    }
  };

  return (
    <div className="inspector-bar">
      <div
        className="inspector-tabs segmented-track"
        role="tablist"
        aria-label="Analytical Deep-Dive Inspector"
        style={
          {
            "--active-segment-idx": activeIndex,
            "--segment-count": SEGMENTS.length,
          } as React.CSSProperties
        }
      >
        {/* Physically Interruptible Sliding Thumb Indicator (`segmented-controls.md`, `motion.md`) */}
        <div className="segmented-sliding-thumb" aria-hidden="true" />

        {SEGMENTS.map((seg, idx) => {
          const isSelected = activeTab === seg.id;
          const pressProps = createInstantPress(() => onSelectTab(seg.id));
          return (
            <button
              key={seg.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              className={`inspector-tab ${isSelected ? "active" : ""}`}
              onPointerDown={pressProps.onPointerDown}
              onClick={pressProps.onClick}
              onKeyDown={(e) => {
                pressProps.onKeyDown(e);
                handleKeyDown(e, idx);
              }}
            >
              {seg.label}
            </button>
          );
        })}
      </div>

      <div
        className="inspector-palette-meta"
        title="Dynamic club series colors verified for >= 4.5:1 WCAG contrast"
      >
        <span className="series-swatch">
          <span
            className="series-swatch-box"
            style={{ background: homeSeriesColor }}
          />
          <span>
            {homeTla} ({homeContrastRatio}:1)
          </span>
        </span>
        <span className="series-swatch">
          <span
            className="series-swatch-box"
            style={{ background: awaySeriesColor }}
          />
          <span>
            {awayTla} ({awayContrastRatio}:1)
          </span>
        </span>
      </div>
    </div>
  );
}
