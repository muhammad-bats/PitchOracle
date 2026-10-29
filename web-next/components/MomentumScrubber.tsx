"use client";

import React, { useState } from "react";
import { createInstantPress } from "@/lib/instant-press";
import type { GoalTimelineInterval } from "@/lib/types";

interface MomentumScrubberProps {
  timeline: GoalTimelineInterval[];
  homeShort: string;
  awayShort: string;
  totalHomeXg: number;
  totalAwayXg: number;
  activeIntervalIdx: number | null;
  onSelectInterval: (idx: number | null) => void;
}

const INTERVAL_WEIGHTS = [0.12, 0.15, 0.18, 0.16, 0.18, 0.21];

export function MomentumScrubber({
  timeline,
  homeShort,
  awayShort,
  totalHomeXg,
  totalAwayXg,
  activeIntervalIdx,
  onSelectInterval,
}: MomentumScrubberProps) {
  const [isPointerScrubbing, setIsPointerScrubbing] = useState(false);

  if (!timeline || timeline.length === 0) return null;

  const targetIdx =
    activeIntervalIdx !== null ? activeIntervalIdx : timeline.length - 1;
  const cumulativeWeight = INTERVAL_WEIGHTS.slice(0, targetIdx + 1).reduce(
    (acc, w) => acc + w,
    0
  );
  const cumHomeXg = (totalHomeXg * cumulativeWeight).toFixed(2);
  const cumAwayXg = (totalAwayXg * cumulativeWeight).toFixed(2);
  const activePeriod =
    activeIntervalIdx !== null ? timeline[activeIntervalIdx] : null;

  const handleKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      onSelectInterval(Math.min(timeline.length - 1, idx + 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      onSelectInterval(Math.max(0, idx - 1));
    } else if (e.key === "Escape") {
      e.preventDefault();
      onSelectInterval(null);
    }
  };

  return (
    <div
      className="momentum-scrubber-box"
      role="region"
      aria-label="90-Minute Matchday Momentum and Expected Goals Pressure Scrubber"
      onPointerUp={() => setIsPointerScrubbing(false)}
      onPointerCancel={() => setIsPointerScrubbing(false)}
    >
      <div className="scrubber-header">
        <div className="scrubber-title">
          <span className="accent-dot" aria-hidden="true" />
          <span>90-Minute Match Clock &amp; xG Pressure Scrubber</span>
        </div>
        <div className="scrubber-readout-wrap">
          <div className="scrubber-live-readout" aria-live="polite">
            {activePeriod ? (
              <>
                Window {activePeriod.period}: {homeShort} {cumHomeXg} xG –{" "}
                {cumAwayXg} xG {awayShort} ({activePeriod.any_goal_prob}% Goal
                Probability)
              </>
            ) : (
              <>
                Full 90&apos; Projection: {homeShort} {totalHomeXg.toFixed(2)}{" "}
                xG – {totalAwayXg.toFixed(2)} xG {awayShort} (Select or Scrub
                Window)
              </>
            )}
          </div>
          {activeIntervalIdx !== null && (
            <button
              type="button"
              className="scrubber-clear-btn"
              {...createInstantPress(() => onSelectInterval(null))}
            >
              Reset to 90&apos; View
            </button>
          )}
        </div>
      </div>

      <div
        className="scrubber-intervals-grid"
        role="group"
        aria-label="15-minute match intervals"
      >
        {timeline.map((item, idx) => {
          const isSelected = activeIntervalIdx === idx;
          const hHeight = Math.max(
            6,
            Math.min(52, Math.round(item.home_goal_prob * 1.35))
          );
          const aHeight = Math.max(
            6,
            Math.min(52, Math.round(item.away_goal_prob * 1.35))
          );

          const pressProps = createInstantPress(() => {
            setIsPointerScrubbing(true);
            onSelectInterval(activeIntervalIdx === idx ? null : idx);
          });

          return (
            <button
              key={item.period}
              type="button"
              className={`scrubber-interval-btn ${isSelected ? "active" : ""}`}
              aria-pressed={isSelected}
              aria-label={`${item.period}: ${item.any_goal_prob}% goal probability (${homeShort} ${item.home_goal_prob}%, ${awayShort} ${item.away_goal_prob}%)`}
              onPointerDown={pressProps.onPointerDown}
              onClick={pressProps.onClick}
              onPointerEnter={() => {
                if (isPointerScrubbing) {
                  onSelectInterval(idx);
                }
              }}
              onFocus={() => onSelectInterval(idx)}
              onBlur={() => {
                if (!isPointerScrubbing) {
                  onSelectInterval(null);
                }
              }}
              onKeyDown={(e) => {
                pressProps.onKeyDown(e);
                handleKeyDown(e, idx);
              }}
            >
              <div className="scrubber-bars" aria-hidden="true">
                <div
                  className="scrubber-bar-home"
                  style={{ height: `${hHeight}px` }}
                />
                <div
                  className="scrubber-bar-away"
                  style={{ height: `${aHeight}px` }}
                />
              </div>
              <div className="scrubber-pct">{item.any_goal_prob}%</div>
              <div className="scrubber-period">{item.period}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
