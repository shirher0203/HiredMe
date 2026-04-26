import {
  calculateSkillOverlap,
  findAdvantageMatches,
  calculateFinalMatchScore,
  buildDeterministicMatch,
} from "../../services/matching/matching.service";

describe("calculateSkillOverlap", () => {
  it("returns 100 when every required skill is present", () => {
    const result = calculateSkillOverlap(
      ["react", "node", "typescript"],
      ["react", "node", "typescript"]
    );
    expect(result.algorithmicScore).toBe(100);
    expect(result.matched).toEqual(["react", "node", "typescript"]);
    expect(result.missing).toEqual([]);
  });

  it("returns 0 when nothing matches", () => {
    const result = calculateSkillOverlap(["python"], ["react", "node"]);
    expect(result.algorithmicScore).toBe(0);
    expect(result.matched).toEqual([]);
    expect(result.missing).toEqual(["react", "node"]);
  });

  it("is alias-aware (React.js in profile matches react required)", () => {
    const result = calculateSkillOverlap(["React.js"], ["react"]);
    expect(result.matched).toEqual(["react"]);
    expect(result.missing).toEqual([]);
    expect(result.algorithmicScore).toBe(100);
  });

  it("returns zeros for empty requiredSkills", () => {
    const result = calculateSkillOverlap(["react", "node"], []);
    expect(result.algorithmicScore).toBe(0);
    expect(result.matched).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it("rounds algorithmic score correctly for partial overlap", () => {
    const result = calculateSkillOverlap(
      ["React.js", "Node", "TypeScript"],
      ["react", "mongodb", "node"]
    );
    expect(result.matched).toEqual(["react", "node"]);
    expect(result.missing).toEqual(["mongodb"]);
    expect(result.algorithmicScore).toBe(67);
  });
});

describe("findAdvantageMatches", () => {
  it("returns only the intersection, alias-aware", () => {
    const result = findAdvantageMatches(
      ["React.js", "Node", "TypeScript"],
      ["docker", "typescript"]
    );
    expect(result).toEqual(["typescript"]);
  });

  it("returns an empty array when there is no overlap", () => {
    expect(findAdvantageMatches(["react"], ["docker", "aws"])).toEqual([]);
  });

  it("returns an empty array when advantage skills are empty", () => {
    expect(findAdvantageMatches(["react"], [])).toEqual([]);
  });
});

describe("calculateFinalMatchScore", () => {
  it("weights 70% algorithmic / 30% AI", () => {
    expect(calculateFinalMatchScore(100, 0)).toBe(70);
    expect(calculateFinalMatchScore(0, 100)).toBe(30);
    expect(calculateFinalMatchScore(100, 100)).toBe(100);
    expect(calculateFinalMatchScore(50, 50)).toBe(50);
  });

  it("clamps negative inputs to 0", () => {
    expect(calculateFinalMatchScore(-50, -50)).toBe(0);
    expect(calculateFinalMatchScore(-10, 100)).toBe(30);
  });

  it("clamps inputs above 100 to 100", () => {
    expect(calculateFinalMatchScore(150, 150)).toBe(100);
    expect(calculateFinalMatchScore(200, 0)).toBe(70);
  });
});

describe("buildDeterministicMatch", () => {
  it("combines overlap, advantage matches, and AI semantic score end-to-end", () => {
    const result = buildDeterministicMatch(
      ["React.js", "Node", "TypeScript"],
      ["react", "mongodb", "node"],
      ["docker", "typescript"],
      60,
      "solid overall fit"
    );

    expect(result.matchedRequired).toEqual(["react", "node"]);
    expect(result.missingRequired).toEqual(["mongodb"]);
    expect(result.matchedAdvantage).toEqual(["typescript"]);
    expect(result.algorithmicScore).toBe(67);
    expect(result.aiSemanticScore).toBe(60);
    expect(result.finalScore).toBe(65);
    expect(result.explanation).toBe("solid overall fit");
  });

  it("falls back to a default message when aiExplanation is empty or whitespace", () => {
    const emptyResult = buildDeterministicMatch(
      ["react"],
      ["react"],
      [],
      70,
      ""
    );
    expect(emptyResult.explanation).toBe("No AI explanation provided.");

    const whitespaceResult = buildDeterministicMatch(
      ["react"],
      ["react"],
      [],
      70,
      "   \n\t  "
    );
    expect(whitespaceResult.explanation).toBe("No AI explanation provided.");
  });

  it("trims surrounding whitespace from a non-empty aiExplanation", () => {
    const result = buildDeterministicMatch(
      ["react"],
      ["react"],
      [],
      70,
      "   solid fit  \n"
    );
    expect(result.explanation).toBe("solid fit");
  });
});
