"use client";

import React, { useEffect } from "react";
import { createInstantPress } from "@/lib/instant-press";

interface ConfirmRetrainDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Apple HIG Alert Dialog (`alerts.md`)
 * - Title-style capitalization on fragment title (no ending punctuation)
 * - Sentence-style capitalization on concise informative text
 * - Leading "Cancel" button, trailing primary "Sync & Retrain" verb phrase button
 * - Supports Escape / Command-Period to cancel and Return to confirm
 * - Fluid, physically interruptible CSS spring transition (`--ease-spring-fluid`)
 */
export function ConfirmRetrainDialog({
  isOpen,
  onCancel,
  onConfirm,
}: ConfirmRetrainDialogProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape" || (e.metaKey && e.key === ".")) {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel, onConfirm]);

  return (
    <>
      <div
        className={`alert-dialog-backdrop ${isOpen ? "open" : ""}`}
        aria-hidden="true"
        onPointerDown={onCancel}
      />
      <div
        className={`apple-alert-dialog ${isOpen ? "open" : ""}`}
        role="alertdialog"
        aria-modal={isOpen}
        aria-hidden={!isOpen}
        aria-labelledby="alert-retrain-title"
        aria-describedby="alert-retrain-desc"
      >
        <div className="alert-dialog-content">
          <h3 id="alert-retrain-title" className="alert-dialog-title">
            Sync Historical Data and Retrain Ensemble
          </h3>
          <p id="alert-retrain-desc" className="alert-dialog-desc">
            Refreshing match records across all six competitions recalibrates
            the XGBoost, Random Forest, and Dixon-Coles models with the latest
            form and Elo ratings.
          </p>
        </div>

        <div className="alert-dialog-actions">
          <button
            type="button"
            className="alert-btn-cancel"
            {...createInstantPress(onCancel)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="alert-btn-primary"
            {...createInstantPress(onConfirm)}
          >
            Sync &amp; Retrain
          </button>
        </div>
      </div>
    </>
  );
}
