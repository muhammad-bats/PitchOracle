"use client";

import React from "react";
import { hexToRgb } from "@/lib/color-guard";
import { createInstantPress } from "@/lib/instant-press";
import type { ScorelineEntry } from "@/lib/types";

interface ScoreMatrixProps {
  scoreMatrix: number[][];
  mostLikely: ScorelineEntry;
  topScorelines: ScorelineEntry[];
  homeShort: string;
  awayShort: string;
  homeSeriesColor: string;
  awaySeriesColor: string;
  onSelectScoreline?: (homeGoals: number, awayGoals: number, prob: number) => void;
}

export function ScoreMatrix({
  scoreMatrix,
  mostLikely,
  topScorelines,
  homeShort,
  awayShort,
  homeSeriesColor,
  awaySeriesColor,
  onSelectScoreline,
}: ScoreMatrixProps) {
  let maxProb = 0.01;
  scoreMatrix.forEach((row) =>
    row.forEach((v) => {
      if (v > maxProb) maxProb = v;
    })
  );

  const homeRgb = hexToRgb(homeSeriesColor);
  const awayRgb = hexToRgb(awaySeriesColor);

  return (
    <div className="surface-card">
      <div className="card-header-flex">
        <div>
          <h3 className="card-title">
            Exact Scoreline Probability Matrix (7×7)
          </h3>
          <p className="card-subtitle">
            Dixon-Coles bivariate Poisson calibrated with Hybrid Ensemble (Press
            any scoreline cell to open telemetry sheet)
          </p>
        </div>
      </div>

      <div className="heatmap-wrapper">
        <div className="heatmap-axis-label-top">
          {awayShort} Goals (Away) →
        </div>
        <div className="heatmap-body">
          <div className="heatmap-axis-label-left">
            {homeShort} Goals (Home) ↓
          </div>
          <div
            className="heatmap-grid"
            role="grid"
            aria-label={`7 by 7 exact scoreline probability matrix for ${homeShort} versus ${awayShort}`}
          >
            <div className="hm-header-cell">H\A</div>
            {[0, 1, 2, 3, 4, 5, 6].map((ag) => (
              <div key={`col-${ag}`} className="hm-header-cell">
                {ag}
              </div>
            ))}

            {scoreMatrix.map((row, hg) => (
              <React.Fragment key={`row-${hg}`}>
                <div className="hm-header-cell">{hg}</div>
                {row.map((prob, ag) => {
                  const intensity = Math.min(1, prob / maxProb);
                  const alpha = Number((0.08 + intensity * 0.68).toFixed(2));
                  let bg: string;
                  if (hg > ag) {
                    bg = `rgba(${homeRgb.r}, ${homeRgb.g}, ${homeRgb.b}, ${alpha})`;
                  } else if (hg === ag) {
                    bg = `rgba(148, 163, 184, ${alpha})`;
                  } else {
                    bg = `rgba(${awayRgb.r}, ${awayRgb.g}, ${awayRgb.b}, ${alpha})`;
                  }

                  // Automatic Foreground Contrast Guard: switch to dark ink when cell fill is bright
                  const fgColor =
                    intensity > 0.58 ? "#090D0B" : "var(--text-primary)";
                  const isBest =
                    hg === mostLikely.home_goals &&
                    ag === mostLikely.away_goals;
                  const isDraw = hg === ag;

                  return (
                    <button
                      key={`${hg}-${ag}`}
                      type="button"
                      role="gridcell"
                      className={`hm-cell hm-cell-interactive ${
                        isBest ? "best-score" : ""
                      } ${isDraw ? "draw-cell" : ""}`}
                      style={{ background: bg, color: fgColor }}
                      title={`${homeShort} ${hg} - ${ag} ${awayShort}: ${prob.toFixed(
                        1
                      )}% (Press to inspect)`}
                      {...createInstantPress(() =>
                        onSelectScoreline?.(hg, ag, prob)
                      )}
                    >
                      <div className="hm-score-lbl">
                        {hg}-{ag}
                      </div>
                      <div className="hm-prob-lbl">{prob.toFixed(1)}%</div>
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      <div className="top-scores-title">Top 6 Most Likely Exact Scorelines</div>
      <div className="top-scores-row">
        {topScorelines.map((item) => (
          <button
            key={item.score}
            type="button"
            className="top-score-pill top-score-btn"
            {...createInstantPress(() =>
              onSelectScoreline?.(
                item.home_goals,
                item.away_goals,
                item.probability
              )
            )}
          >
            <div className="sc">{item.score}</div>
            <div className="pr">{item.probability}%</div>
          </button>
        ))}
      </div>
    </div>
  );
}
