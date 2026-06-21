import type { NextFunction, Request, Response } from "express";
import { requireUser } from "./controller-utils";
import {
  parseRepoUrl,
  fetchRepoMetadata,
} from "../services/github/github.service";
import { analyzeGithubRepo } from "../services/ai/ai.service";

export async function analyzeRepo(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    requireUser(req);
    const body = (req.validated?.body ?? req.body ?? {}) as { url?: string };
    const url = typeof body.url === "string" ? body.url : "";

    const { owner, repo } = parseRepoUrl(url);
    const metadata = await fetchRepoMetadata(owner, repo);
    const analysis = await analyzeGithubRepo({ metadata });

    return res.status(200).json({
      repo: metadata.fullName,
      metadata,
      analysis,
    });
  } catch (err) {
    return next(err);
  }
}
