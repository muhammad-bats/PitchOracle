"use client";

import React, { useEffect, useRef, useState } from "react";
import { createInstantPress } from "@/lib/instant-press";

export interface SelectedScorelineDetail {
  homeGoals: number;
  awayGoals: number;
  probability: number;
  homeShort: string;
  awayShort: string;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
}

interface ScorelineDetailSheetProps {
  detail: SelectedScorelineDetail | null;
  onClose: () => void;
  onApplyTempoForScoreline?: (suggestedTempo: number) => void;
}

export function ScorelineDetailSheet({
  detail,
  onClose,
  onApplyTempoForScoreline,
}: ScorelineDetailSheetProps) {
  const isOpen = detail !== null;
  const [lastDetail, setLastDetail] = useState<SelectedScorelineDetail | null>(
    detail
  );
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef<number | null>(null);

  useEffect(() => {
    if (detail) {
      setLastDetail(detail);
      setDragY(0);
    }
  }, [detail]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isOpen && e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const active = detail || lastDetail;
  const totalGoals = active ? active.homeGoals + active.awayGoals : 0;
  const fairDecimalOdds =
    active && active.probability > 0.05
      ? (100 / active.probability).toFixed(2)
      : "99.00";
  const suggestedTempo =
    totalGoals >= 4 ? 0.6 : totalGoals <= 1 ? -0.5 : 0.0;

  const outcomeLabel = active
    ? active.homeGoals > active.awayGoals
      ? `${active.homeShort} Victory`
      : active.homeGoals === active.awayGoals
      ? "Regulation Draw"
      : `${active.awayShort} Victory`
    : "";

  const handleGrabberDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    startYRef.current = e.clientY;
    setIsDragging(true);
  };

  const handleGrabberMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (startYRef.current === null) return;
    const dy = Math.max(0, e.clientY - startYRef.current);
    setDragY(dy);
  };

  const handleGrabberUp = () => {
    if (dragY > 75) {
      onClose();
    }
    setDragY(0);
    startYRef.current = null;
    setIsDragging(false);
  };

  return (
    <>
      <div
        className={`score-sheet-backdrop ${isOpen ? "open" : ""}`}
        aria-hidden="true"
        onPointerDown={onClose}
      />
      <div
        className={`score-detail-sheet ${isOpen ? "open" : ""} ${
          isDragging ? "dragging" : ""
        }`}
        role="dialog"
        aria-modal={isOpen}
        aria-hidden={!isOpen}
        aria-label="Exact Scoreline Telemetry Sheet"
        style={
          dragY > 0
            ? { transform: `translate3d(-50%, ${dragY}px, 0)` }
            : undefined
        }
      >
        {/* Resizable / Swipe-to-Dismiss Grabber (`sheets.md`) */}
        <div
          className="sheet-grabber-bar"
          onPointerDown={handleGrabberDown}
          onPointerMove={handleGrabberMove}
          onPointerUp={handleGrabberUp}
          onPointerCancel={handleGrabberUp}
        >
          <span className="sheet-grabber-pill" aria-hidden="true" />
        </div>

        {/* Apple Sheet Toolbar: Cancel on leading edge, Done/Action on trailing edge (`sheets.md`) */}
        <div className="score-sheet-toolbar">
          <button
            type="button"
            className="sheet-cancel-btn"
            {...createInstantPress(onClose)}
          >
            Close
          </button>
          <div className="score-sheet-heading">
            Exact Scoreline Telemetry
          </div>
          {onApplyTempoForScoreline && (
            <button
              type="button"
              className="sheet-done-btn"
              {...createInstantPress(() => {
                onApplyTempoForScoreline(suggestedTempo);
                onClose();
              })}
            >
              Simulate Tempo ({suggestedTempo >= 0 ? `+${suggestedTempo}` : suggestedTempo})
            </button>
          )}
        </div>

        {active && (
          <div className="score-sheet-body">
            <div className="score-sheet-hero">
              <div className="score-sheet-clubs">
                <span>{active.homeShort}</span>
                <span className="score-sheet-big tabular-nums">
                  {active.homeGoals} &ndash; {active.awayGoals}
                </span>
                <span>{active.awayShort}</span>
              </div>
              <div className="score-sheet-outcome">{outcomeLabel}</div>
            </div>

            <div className="score-sheet-kpis">
              <div className="market-box">
                <div className="market-name">Dixon-Coles Probability</div>
                <div className="market-val tabular-nums">
                  {active.probability.toFixed(2)}%
                </div>
              </div>
              <div className="market-box">
                <div className="market-name">Implied Fair Decimal</div>
                <div className="market-val tabular-nums">{fairDecimalOdds}</div>
              </div>
              <div className="market-box">
                <div className="market-name">Monte Carlo Hits (10k)</div>
                <div className="market-val tabular-nums">
                  ~{Math.round(active.probability * 100)} sims
                </div>
              </div>
              <div className="market-box">
                <div className="market-name">Total Match Goals</div>
                <div className="market-val tabular-nums">
                  {totalGoals} ({totalGoals > 2.5 ? "Over 2.5" : "Under 2.5"})
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
