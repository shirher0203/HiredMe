import type { ProfileInput } from "../services/matching/matching.types";
import { hashPayload } from "./hash";

type UserProfileSource = {
  profile?: {
    skills?: string[];
    experienceYears?: number;
    projects?: string[];
    education?: string | null;
    goals?: string | null;
  };
};

export function userToProfileInput(user: UserProfileSource): ProfileInput {
  const p = user.profile;
  return {
    skills: p?.skills ?? [],
    experienceYears: p?.experienceYears ?? 0,
    projects: p?.projects ?? [],
    education: p?.education ?? undefined,
    goals: p?.goals ?? undefined,
  };
}

/**
 * Deterministic fingerprint: profile snapshot + job hash + resume text hash.
 * Uses stable key order via `hashPayload` (see `hash.ts`).
 */
export function computeMatchInputFingerprint(
  profile: ProfileInput,
  jobDescriptionHash: string,
  resumeTextHash: string
): string {
  return hashPayload({
    profile: {
      skills: profile.skills,
      experienceYears: profile.experienceYears,
      projects: profile.projects,
      education: profile.education ?? null,
      goals: profile.goals ?? null,
    },
    jobDescriptionHash,
    resumeTextHash,
  });
}
