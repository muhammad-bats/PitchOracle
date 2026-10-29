"use client";

import React, { useEffect, useRef, useState } from "react";
import { createInstantPress } from "@/lib/instant-press";
import type { WhatIfState } from "@/lib/types";

interface WhatIfSandboxProps {
  homeShort: string;
  awayShort: string;
  whatIf: WhatIfState;
  onChange: (next: WhatIfState) => void;
}

interface TacticalPreset {
  id: string;
  title: string;
  description: string;
  state: WhatIfState;
}

const TACTICAL_PRESETS: TacticalPreset[] = [
  {
    id: "baseline",
    title: "Standard Matchday Baseline",
    description: "Unadjusted pre-match Elo, form, and stadium advantage.",
    state: { homeBoost: 0, awayBoost: 0, tempo: 0, neutralVenue: false },
  },
  {
    id: "high-press",
    title: "High-Tempo End-to-End Clash",
    description: "Aggressive high line and rapid transition pace (+0.7 Tempo).",
    state: { homeBoost: 0.2, awayBoost: 0.2, tempo: 0.7, neutralVenue: false },
  },
  {
    id: "home-crisis",
    title: "Home Key Striker Absence",
    description: "Reduced home attacking availability (-0.6 Home Form).",
    state: { homeBoost: -0.6, awayBoost: 0.1, tempo: -0.1, neutralVenue: false },
  },
  {
    id: "ucl-final",
    title: "Continental Neutral Showpiece",
    description: "Neutral stadium with disciplined knockout-stage tempo.",
    state: { homeBoost: 0, awayBoost: 0, tempo: -0.3, neutralVenue: true },
  },
];

export function WhatIfSandbox({
  homeShort,
  awayShort,
  whatIf,
  onChange,
}: WhatIfSandboxProps) {
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocPointerDown = (e: PointerEvent) => {
      if (
        presetMenuOpen &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        setPresetMenuOpen(false);
      }
    };
    const onDocKeyDown = (e: KeyboardEvent) => {
      if (presetMenuOpen && e.key === "Escape") {
        setPresetMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [presetMenuOpen]);

  const resetPress = createInstantPress(() =>
    onChange({
      homeBoost: 0,
      awayBoost: 0,
      tempo: 0,
      neutralVenue: false,
    })
  );

  const togglePresetMenuPress = createInstantPress(() =>
    setPresetMenuOpen((prev) => !prev)
  );

  const toggleNeutralPress = createInstantPress(() =>
    onChange({
      ...whatIf,
      neutralVenue: !whatIf.neutralVenue,
    })
  );

  return (
    <div className="surface-card what-if-card">
      <div className="card-header-flex">
        <div>
          <h3 className="card-title">Tactical Scenario Simulator</h3>
          <p className="card-subtitle">
            Adjust squad availability, match tempo, or venue neutrality to
            stress-test the ensemble forecast in real time.
          </p>
        </div>

        <div className="what-if-actions" ref={menuRef}>
          {/* Tactical Scenario Pop-Up Menu (`menus.md`, `popovers.md` — Verb Phrase Label) */}
          <button
            type="button"
            className={`btn-preset-trigger ${presetMenuOpen ? "open" : ""}`}
            aria-haspopup="menu"
            aria-expanded={presetMenuOpen}
            {...togglePresetMenuPress}
          >
            <span>Apply Scenario</span>
            <span className="popup-chevron" aria-hidden="true">
              ▾
            </span>
          </button>

          <div
            className={`preset-popover-menu ${presetMenuOpen ? "open" : ""}`}
            role="menu"
            aria-label="Tactical Scenario Presets"
          >
            {TACTICAL_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                role="menuitem"
                className="preset-menu-item"
                {...createInstantPress(() => {
                  onChange(preset.state);
                  setPresetMenuOpen(false);
                })}
              >
                <div className="preset-item-title">{preset.title}</div>
                <div className="preset-item-desc">{preset.description}</div>
              </button>
            ))}
          </div>

          <button type="button" className="btn-reset" {...resetPress}>
            Reset Baseline
          </button>
        </div>
      </div>

      <div className="what-if-grid">
        <div className="slider-control">
          <div className="slider-header">
            <label htmlFor="slider-home-boost">{homeShort} Form Boost</label>
            <span className="slider-val tabular-nums">
              {whatIf.homeBoost >= 0
                ? `+${whatIf.homeBoost.toFixed(1)}`
                : whatIf.homeBoost.toFixed(1)}
            </span>
          </div>
          <input
            id="slider-home-boost"
            type="range"
            min="-1.0"
            max="1.0"
            step="0.1"
            value={whatIf.homeBoost}
            onChange={(e) =>
              onChange({
                ...whatIf,
                homeBoost: parseFloat(e.target.value),
              })
            }
          />
          <div className="slider-ticks">
            <span>Depleted (-1.0)</span>
            <span>Baseline</span>
            <span>Peak (+1.0)</span>
          </div>
        </div>

        <div className="slider-control">
          <div className="slider-header">
            <label htmlFor="slider-away-boost">{awayShort} Form Boost</label>
            <span className="slider-val tabular-nums">
              {whatIf.awayBoost >= 0
                ? `+${whatIf.awayBoost.toFixed(1)}`
                : whatIf.awayBoost.toFixed(1)}
            </span>
          </div>
          <input
            id="slider-away-boost"
            type="range"
            min="-1.0"
            max="1.0"
            step="0.1"
            value={whatIf.awayBoost}
            onChange={(e) =>
              onChange({
                ...whatIf,
                awayBoost: parseFloat(e.target.value),
              })
            }
          />
          <div className="slider-ticks">
            <span>Depleted (-1.0)</span>
            <span>Baseline</span>
            <span>Peak (+1.0)</span>
          </div>
        </div>

        <div className="slider-control">
          <div className="slider-header">
            <label htmlFor="slider-tempo">Tactical Match Tempo</label>
            <span className="slider-val tabular-nums">
              {whatIf.tempo >= 0
                ? `+${whatIf.tempo.toFixed(1)}`
                : whatIf.tempo.toFixed(1)}
            </span>
          </div>
          <input
            id="slider-tempo"
            type="range"
            min="-1.0"
            max="1.0"
            step="0.1"
            value={whatIf.tempo}
            onChange={(e) =>
              onChange({
                ...whatIf,
                tempo: parseFloat(e.target.value),
              })
            }
          />
          <div className="slider-ticks">
            <span>Low Block (-1.0)</span>
            <span>Standard</span>
            <span>High Press (+1.0)</span>
          </div>
        </div>

        <div className="toggle-control">
          <button
            type="button"
            role="switch"
            aria-checked={whatIf.neutralVenue}
            className={`switch-button-card ${
              whatIf.neutralVenue ? "checked" : ""
            }`}
            {...toggleNeutralPress}
          >
            <span className="switch-indicator" aria-hidden="true">
              <span className="switch-thumb" />
            </span>
            <span className="switch-copy">
              <span className="toggle-title">Neutral Venue Mode</span>
              <span className="toggle-desc">
                Remove home stadium advantage for cup finals.
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
