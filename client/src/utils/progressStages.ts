/**
 * Staged progress messaging for a single in-flight request.
 *
 * This is perception, not measurement. The match request runs two dependent
 * provider calls behind one HTTP request — the job is analysed, then compared
 * with the CV — and the server reports nothing in between. Rather than fabricate
 * server progress, the messages name the pipeline stages that are known to
 * happen, on a timeline calibrated to observed durations, and fall back to a
 * neutral message once past them so no stage is ever claimed as complete.
 */

export interface ProgressStage {
  /** Elapsed milliseconds at which this message takes over. */
  readonly atMs: number;
  readonly message: string;
}

/**
 * Calibrated against measured provider timings: job analysis runs about
 * 1.0-2.1s and the resume-aware comparison about 1.3-1.6s.
 */
export const MATCH_ANALYSIS_STAGES: readonly ProgressStage[] = [
  { atMs: 0, message: "Analysing the job description…" },
  { atMs: 1600, message: "Comparing the job with your CV…" },
  { atMs: 3600, message: "Almost done…" },
  { atMs: 9000, message: "Working…" },
];

/** Pure: the message to show for a given elapsed time. */
export function stageForElapsedMs(
  elapsedMs: number,
  stages: readonly ProgressStage[] = MATCH_ANALYSIS_STAGES
): string {
  let current = stages[0]?.message ?? "";
  for (const stage of stages) {
    if (elapsedMs >= stage.atMs) current = stage.message;
    else break;
  }
  return current;
}
