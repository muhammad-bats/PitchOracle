"use client";

import React from "react";

interface ClubCrestProps {
  tla: string;
  primaryColor: string;
  secondaryColor: string;
}

export function ClubCrest({
  tla,
  primaryColor,
  secondaryColor,
}: ClubCrestProps) {
  const safeId = `grad-${tla.replace(/[^a-zA-Z0-9]/g, "")}`;
  const endColor =
    secondaryColor === "#FFFFFF" ? "#1e293b" : secondaryColor || "#1e293b";

  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`${tla} Club Crest`}
    >
      <defs>
        <linearGradient
          id={safeId}
          x1="0"
          y1="0"
          x2="64"
          y2="64"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor={primaryColor} />
          <stop offset="100%" stopColor={endColor} />
        </linearGradient>
      </defs>
      <path
        d="M32 4L56 14V30C56 46.5 45.8 56.2 32 60C18.2 56.2 8 46.5 8 30V14L32 4Z"
        fill={`url(#${safeId})`}
        stroke="rgba(255,255,255,0.78)"
        strokeWidth="2.2"
      />
      <path
        d="M32 8L52 16.5V30C52 43.8 43.4 52.1 32 55.5C20.6 52.1 12 43.8 12 30V16.5L32 8Z"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth="1.2"
        fill="rgba(9,13,11,0.32)"
      />
      <text
        x="32"
        y="37"
        textAnchor="middle"
        fill="#ffffff"
        fontFamily="var(--font-display)"
        fontWeight="800"
        fontSize="14"
        letterSpacing="0.5"
      >
        {tla}
      </text>
    </svg>
  );
}
