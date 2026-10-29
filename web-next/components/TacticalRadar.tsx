"use client";

import React from "react";
import type { TeamProfile } from "@/lib/types";

interface TacticalRadarProps {
  home: TeamProfile;
  away: TeamProfile;
  homeSeriesColor: string;
  awaySeriesColor: string;
}

export function TacticalRadar({
  home,
  away,
  homeSeriesColor,
  awaySeriesColor,
}: TacticalRadarProps) {
  const axes = [
    { label: "Attack", h: home.attack, a: away.attack },
    { label: "Defense", h: home.defense, a: away.defense },
    {
      label: "Elo Power",
      h: Math.min(98, (home.current_elo - 1400) / 6.2),
      a: Math.min(98, (away.current_elo - 1400) / 6.2),
    },
    {
      label: "Form",
      h: Math.min(98, 45 + home.ppg_last_5 * 17),
      a: Math.min(98, 45 + away.ppg_last_5 * 17),
    },
    {
      label: "Possession",
      h: home.possession_style * 130,
      a: away.possession_style * 130,
    },
    {
      label: "Pressing",
      h: home.pressing_intensity * 102,
      a: away.pressing_intensity * 102,
    },
  ];

  const cx = 160;
  const cy = 128;
  const radius = 84;
  const n = axes.length;

  const getPoint = (idx: number, val: number): [number, number] => {
    const angle = (Math.PI * 2 * idx) / n - Math.PI / 2;
    const r = (Math.max(20, Math.min(100, val)) / 100) * radius;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  };

  const homePoints = axes.map((ax, i) => getPoint(i, ax.h));
  const awayPoints = axes.map((ax, i) => getPoint(i, ax.a));

  const homePoly = homePoints.map((p) => p.join(",")).join(" ");
  const awayPoly = awayPoints.map((p) => p.join(",")).join(" ");

  return (
    <div className="radar-container">
      <svg
        width="320"
        height="256"
        viewBox="0 0 320 256"
        role="img"
        aria-label={`Tactical 6-axis radar chart comparing ${home.name} (solid line, circular markers) and ${away.name} (dashed line, diamond markers)`}
      >
        <title>
          Tactical Profile Comparison: {home.name} vs {away.name}
        </title>
        <desc>
          Six-axis radar comparing Attack, Defense, Elo Power, Form, Possession,
          and Pressing intensity.
        </desc>

        {/* Concentric Reference Rings */}
        {[0.35, 0.68, 1.0].map((scale) => {
          const pts = axes
            .map((_, i) => {
              const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
              return `${cx + radius * scale * Math.cos(angle)},${
                cy + radius * scale * Math.sin(angle)
              }`;
            })
            .join(" ");
          return (
            <polygon
              key={scale}
              points={pts}
              fill="none"
              stroke="var(--border-strong)"
              strokeWidth="1"
            />
          );
        })}

        {/* Axis Spokes & 12px Accessible Labels */}
        {axes.map((ax, i) => {
          const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
          const x2 = cx + radius * Math.cos(angle);
          const y2 = cy + radius * Math.sin(angle);
          const lx = cx + (radius + 28) * Math.cos(angle);
          const ly = cy + (radius + 18) * Math.sin(angle);
          return (
            <g key={ax.label}>
              <line
                x1={cx}
                y1={cy}
                x2={x2}
                y2={y2}
                stroke="var(--border-subtle)"
                strokeWidth="1"
              />
              <text
                x={lx}
                y={ly + 4}
                textAnchor="middle"
                fill="var(--text-secondary)"
                fontSize="12"
                fontWeight="600"
                fontFamily="var(--font-mono)"
              >
                {ax.label}
              </text>
            </g>
          );
        })}

        {/* Home Team Polygon (Solid Stroke + Circular Markers) */}
        <polygon
          points={homePoly}
          fill={homeSeriesColor}
          fillOpacity="0.22"
          stroke={homeSeriesColor}
          strokeWidth="2.4"
        />
        {homePoints.map(([px, py], idx) => (
          <circle
            key={`h-${idx}`}
            cx={px}
            cy={py}
            r="3.5"
            fill={homeSeriesColor}
            stroke="var(--surface-card)"
            strokeWidth="1.2"
          />
        ))}

        {/* Away Team Polygon (Dashed Stroke + Diamond Markers per `charts.md` non-color cue) */}
        <polygon
          points={awayPoly}
          fill={awaySeriesColor}
          fillOpacity="0.18"
          stroke={awaySeriesColor}
          strokeWidth="2.4"
          strokeDasharray="5 3"
        />
        {awayPoints.map(([px, py], idx) => (
          <polygon
            key={`a-${idx}`}
            points={`${px},${py - 4.2} ${px + 4.2},${py} ${px},${py + 4.2} ${
              px - 4.2
            },${py}`}
            fill={awaySeriesColor}
            stroke="var(--surface-card)"
            strokeWidth="1.2"
          />
        ))}
      </svg>

      {/* Explicit Accessible Legend */}
      <div className="radar-legend">
        <span className="series-swatch">
          <span
            className="series-swatch-box"
            style={{ background: homeSeriesColor, borderRadius: "50%" }}
          />
          <span>{home.short_name} (Solid •)</span>
        </span>
        <span className="series-swatch">
          <span
            className="series-swatch-box"
            style={{
              background: awaySeriesColor,
              transform: "rotate(45deg)",
            }}
          />
          <span>{away.short_name} (Dashed ◆)</span>
        </span>
      </div>
    </div>
  );
}
