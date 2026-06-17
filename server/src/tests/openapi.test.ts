import { createOpenApiSpec } from "../docs/openapi";

describe("OpenAPI spec (contract drift)", () => {
  it("includes /api/v1/match-flow paths and expected HTTP methods", () => {
    const spec = createOpenApiSpec();
    const { paths } = spec;

    expect(paths).toHaveProperty("/api/v1/match-flow");
    expect(paths["/api/v1/match-flow"]).toMatchObject({
      post: expect.objectContaining({
        summary: expect.stringMatching(/full pipeline/i),
      }),
    });

    expect(paths).toHaveProperty("/api/v1/match-flow/resume");
    expect(paths["/api/v1/match-flow/resume"]).toMatchObject({
      post: expect.any(Object),
    });

    expect(paths).toHaveProperty("/api/v1/match-flow/{id}/parse-resume");
    expect(paths["/api/v1/match-flow/{id}/parse-resume"]).toMatchObject({
      post: expect.any(Object),
    });

    expect(paths).toHaveProperty("/api/v1/match-flow/{id}/job");
    expect(paths["/api/v1/match-flow/{id}/job"]).toMatchObject({
      patch: expect.any(Object),
    });

    expect(paths).toHaveProperty("/api/v1/match-flow/{id}/match");
    expect(paths["/api/v1/match-flow/{id}/match"]).toMatchObject({
      post: expect.any(Object),
    });
  });

  it("registers Match flow tag and response schemas", () => {
    const spec = createOpenApiSpec();

    const tagNames = spec.tags.map((t) => t.name);
    expect(tagNames).toContain("Match flow");

    const schemas = spec.components?.schemas as Record<string, unknown>;
    expect(schemas).toHaveProperty("MatchFlowFullPipelineResponse");
    expect(schemas).toHaveProperty("MatchFlowResumeUploadResponse");
    expect(schemas).toHaveProperty("MatchFlowParseResumeResponse");
    expect(schemas).toHaveProperty("MatchFlowJobAnalysisResponse");
    expect(schemas).toHaveProperty("MatchFlowMatchResponse");
  });

  it("serves stable openapi version and merges legacy paths", () => {
    const spec = createOpenApiSpec();
    expect(spec.openapi).toBe("3.0.3");
    expect(spec.paths).toHaveProperty("/api/v1/cv/extract-text");
    expect(spec.paths).toHaveProperty("/api/match/analyze");
  });
});
