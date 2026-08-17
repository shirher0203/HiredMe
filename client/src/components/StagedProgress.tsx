import { useEffect, useState } from "react";
import {
  MATCH_ANALYSIS_STAGES,
  stageForElapsedMs,
  type ProgressStage,
} from "../utils/progressStages";

/**
 * Shows the current pipeline stage for an in-flight request.
 *
 * The timer is cleared whenever `active` goes false and on unmount, so a stage
 * message can never appear after the request has settled.
 */
export function StagedProgress({
  active,
  stages = MATCH_ANALYSIS_STAGES,
  className,
}: {
  active: boolean;
  stages?: readonly ProgressStage[];
  className?: string;
}) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!active) {
      setElapsedMs(0);
      return;
    }

    const startedAt = Date.now();
    setElapsedMs(0);
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 200);

    return () => clearInterval(timer);
  }, [active, stages]);

  if (!active) return null;

  return (
    <p className={className} aria-live="polite">
      {stageForElapsedMs(elapsedMs, stages)}
    </p>
  );
}
