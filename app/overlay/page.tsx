"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import SleepDetector from "@/components/SleepDetector";

const DEFAULT_SLEEP_THRESHOLD_MS = 2000;

const clampNumber = (value: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(250, value);
};

export default function Overlay() {
  const searchParams = useSearchParams();
  const initialThreshold = useMemo(() => {
    return clampNumber(Number(searchParams.get("sleepThresholdMs")), DEFAULT_SLEEP_THRESHOLD_MS);
  }, [searchParams]);
  const [sleepThresholdMs, setSleepThresholdMs] = useState(initialThreshold);

  useEffect(() => {
    setSleepThresholdMs(initialThreshold);
  }, [initialThreshold]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!event.data || event.data.source !== "sleep-detector-extension") return;
      if (event.data.type !== "settings") return;
      const nextValue = Number(event.data.payload?.sleepThresholdMs);
      if (!Number.isFinite(nextValue)) return;
      setSleepThresholdMs(Math.max(250, nextValue));
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const handleSleepStateChange = useCallback((isAsleep: boolean) => {
    window.parent.postMessage(
      {
        source: "sleep-detector-overlay",
        type: "sleep-state",
        payload: {
          isAsleep,
          timestamp: Date.now()
        }
      },
      "*"
    );
  }, []);

  const handleScreenshot = useCallback((dataUrl: string) => {
    if (!dataUrl) return;
    window.parent.postMessage(
      {
        source: "sleep-detector-overlay",
        type: "screenshot",
        payload: {
          dataUrl,
          createdAt: Date.now()
        }
      },
      "*"
    );
  }, []);

  return (
    <div className="fixed left-0 top-0 w-px h-px overflow-hidden">
      <SleepDetector
        embedded
        sleepDurationMs={sleepThresholdMs}
        onSleepStateChange={handleSleepStateChange}
        onScreenshot={handleScreenshot}
      />
    </div>
  );
}
