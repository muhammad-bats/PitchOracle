"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createInstantPress } from "@/lib/instant-press";
import type { TeamProfile } from "@/lib/types";

interface ClubPickerMenuProps {
  id: string;
  label: string;
  selectedTeamName: string;
  teams: TeamProfile[];
  onSelectTeam: (teamName: string) => void;
}

export function ClubPickerMenu({
  id,
  label,
  selectedTeamName,
  teams,
  onSelectTeam,
}: ClubPickerMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [isDraggingSheet, setIsDraggingSheet] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dragStartYRef = useRef<number | null>(null);

  const selectedClub = useMemo(
    () =>
      teams.find((t) => t.name === selectedTeamName) ||
      teams[0] || {
        name: selectedTeamName,
        short_name: selectedTeamName,
        tla: selectedTeamName.slice(0, 3).toUpperCase(),
        league: "PL",
        primary_color: "#10B981",
        current_elo: 1850,
      },
    [teams, selectedTeamName]
  );

  const filteredTeams = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.short_name.toLowerCase().includes(q) ||
        t.tla.toLowerCase().includes(q) ||
        t.league.toLowerCase().includes(q)
    );
  }, [teams, searchQuery]);

  // Close popover/sheet on outside pointerdown or Escape key
  useEffect(() => {
    const onDocPointerDown = (e: PointerEvent) => {
      if (
        isOpen &&
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const onDocKeyDown = (e: KeyboardEvent) => {
      if (isOpen && e.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setDragOffsetY(0);
      const timer = setTimeout(() => {
        searchInputRef.current?.focus({ preventScroll: true });
      }, 60);
      return () => clearTimeout(timer);
    } else {
      setSearchQuery("");
    }
  }, [isOpen]);

  const toggleMenuPress = createInstantPress(() => {
    setIsOpen((prev) => !prev);
  });

  const handleGrabberPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartYRef.current = e.clientY;
    setIsDraggingSheet(true);
  };

  const handleGrabberPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartYRef.current === null) return;
    const delta = Math.max(0, e.clientY - dragStartYRef.current);
    setDragOffsetY(delta);
  };

  const handleGrabberPointerUp = () => {
    if (dragOffsetY > 72) {
      setIsOpen(false);
    }
    setDragOffsetY(0);
    dragStartYRef.current = null;
    setIsDraggingSheet(false);
  };

  return (
    <div className="selector-group club-picker-root" ref={containerRef}>
      <label htmlFor={id} className="field-label-title">
        {label}
      </label>

      {/* Synchronized native select for form semantics & assistive fallback */}
      <select
        id={id}
        className="sr-only-select"
        tabIndex={-1}
        aria-hidden="true"
        value={selectedTeamName}
        onChange={(e) => onSelectTeam(e.target.value)}
      >
        {teams.map((t) => (
          <option key={`${id}-opt-${t.name}`} value={t.name}>
            {t.name} ({t.league} • Elo {Math.round(t.current_elo)})
          </option>
        ))}
      </select>

      {/* Custom Pop-Up Button (`pop-up-buttons.md` — Instant Down-Press Trigger) */}
      <button
        type="button"
        className={`club-popup-trigger ${isOpen ? "open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`${label}: ${selectedClub.name}`}
        {...toggleMenuPress}
      >
        <span className="club-trigger-leading">
          <span
            className="color-dot"
            style={{ background: selectedClub.primary_color }}
          />
          <span className="club-trigger-tla">{selectedClub.tla}</span>
          <span className="club-trigger-name">{selectedClub.name}</span>
        </span>
        <span className="club-trigger-trailing">
          <span className="elo-pill">
            Elo {Math.round(selectedClub.current_elo)}
          </span>
          <span className="popup-chevron" aria-hidden="true">
            ▾
          </span>
        </span>
      </button>

      {/* Backdrop for Compact Sheet Presentation (`sheets.md` & `popovers.md`) */}
      <div
        className={`picker-sheet-backdrop ${isOpen ? "open" : ""}`}
        aria-hidden="true"
        onPointerDown={() => setIsOpen(false)}
      />

      {/* Fluid, Physically Interruptible Menu / Compact Sheet Surface */}
      <div
        className={`club-popover-menu ${isOpen ? "open" : ""} ${
          isDraggingSheet ? "dragging" : ""
        }`}
        role="dialog"
        aria-label={`Choose ${label}`}
        aria-modal={isOpen}
        style={
          dragOffsetY > 0
            ? { transform: `translate3d(0, ${dragOffsetY}px, 0)` }
            : undefined
        }
      >
        {/* Sheet Grabber Handle for Compact Views (`sheets.md`) */}
        <div
          className="sheet-grabber-bar"
          onPointerDown={handleGrabberPointerDown}
          onPointerMove={handleGrabberPointerMove}
          onPointerUp={handleGrabberPointerUp}
          onPointerCancel={handleGrabberPointerUp}
        >
          <span className="sheet-grabber-pill" aria-hidden="true" />
        </div>

        <div className="club-menu-header">
          <input
            ref={searchInputRef}
            type="search"
            className="club-search-input"
            placeholder="Search by club name, code, or league…"
            aria-label={`Filter ${label}`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button
            type="button"
            className="sheet-cancel-btn"
            {...createInstantPress(() => setIsOpen(false))}
          >
            Done
          </button>
        </div>

        <div
          className="club-options-list"
          role="listbox"
          aria-label={`${label} options`}
        >
          {filteredTeams.map((team) => {
            const isCurrent = team.name === selectedTeamName;
            return (
              <button
                key={`${id}-item-${team.name}`}
                type="button"
                role="option"
                aria-selected={isCurrent}
                className={`club-option-item ${isCurrent ? "selected" : ""}`}
                {...createInstantPress(() => {
                  onSelectTeam(team.name);
                  setIsOpen(false);
                })}
              >
                <span className="club-option-main">
                  <span
                    className="color-dot"
                    style={{ background: team.primary_color }}
                  />
                  <span className="club-option-tla">{team.tla}</span>
                  <span className="club-option-name">{team.name}</span>
                </span>
                <span className="club-option-meta">
                  <span className="club-option-league">{team.league}</span>
                  <span className="tabular-nums">
                    {Math.round(team.current_elo)}
                  </span>
                  <span className="menu-checkmark" aria-hidden="true">
                    {isCurrent ? "✓" : ""}
                  </span>
                </span>
              </button>
            );
          })}

          {/* Actionable Empty State (`writing.md` — Provide clear next steps) */}
          {filteredTeams.length === 0 && (
            <div className="empty-state-card compact">
              <div className="empty-state-title">No Matching Clubs</div>
              <p className="empty-state-desc">
                No clubs match &ldquo;{searchQuery}&rdquo;. Clear the filter to
                browse all available clubs.
              </p>
              <button
                type="button"
                className="empty-state-action"
                {...createInstantPress(() => setSearchQuery(""))}
              >
                Clear Filter
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
