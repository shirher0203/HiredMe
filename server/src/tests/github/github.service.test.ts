import {
  parseRepoUrl,
  fetchRepoMetadata,
  __clearRepoCache,
} from "../../services/github/github.service";
import { HttpError } from "../../utils/http-error";

function mockResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as unknown as Response;
}

describe("parseRepoUrl", () => {
  it("extracts owner and repo from a valid URL", () => {
    expect(parseRepoUrl("https://github.com/shirher0203/HiredMe")).toEqual({
      owner: "shirher0203",
      repo: "HiredMe",
    });
  });

  it("strips a trailing .git", () => {
    expect(parseRepoUrl("https://github.com/owner/repo.git")).toEqual({
      owner: "owner",
      repo: "repo",
    });
  });

  it("rejects a non-github host with 400", () => {
    expect.assertions(2);
    try {
      parseRepoUrl("https://gitlab.com/owner/repo");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(400);
    }
  });

  it("rejects a malformed URL with 400", () => {
    expect(() => parseRepoUrl("not a url")).toThrow(HttpError);
  });
});

describe("fetchRepoMetadata", () => {
  let fetchSpy: jest.SpyInstance | undefined;

  beforeEach(() => {
    __clearRepoCache();
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
    fetchSpy = undefined;
  });

  it("throws a 404 HttpError when the repo is not found", async () => {
    fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(mockResponse(404, {}));
    await expect(fetchRepoMetadata("owner", "missing")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("maps a 403 to a 429 rate-limit HttpError", async () => {
    fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(mockResponse(403, {}));
    await expect(fetchRepoMetadata("owner", "repo")).rejects.toMatchObject({
      status: 429,
    });
  });

  it("fetches+decodes metadata and serves the cache on a second call", async () => {
    const readme = Buffer.from("# Title").toString("base64");
    const pkg = Buffer.from('{"name":"x"}').toString("base64");

    fetchSpy = jest
      .spyOn(global, "fetch")
      .mockImplementation((input: Parameters<typeof fetch>[0]) => {
        const url = String(input);
        if (url.endsWith("/languages")) {
          return Promise.resolve(mockResponse(200, { TypeScript: 100 }));
        }
        if (url.endsWith("/readme")) {
          return Promise.resolve(mockResponse(200, { content: readme }));
        }
        if (url.includes("/contents/package.json")) {
          return Promise.resolve(mockResponse(200, { content: pkg }));
        }
        return Promise.resolve(
          mockResponse(200, {
            full_name: "owner/repo",
            description: "desc",
            language: "TypeScript",
            stargazers_count: 5,
          })
        );
      });

    const first = await fetchRepoMetadata("owner", "repo");
    expect(first.fullName).toBe("owner/repo");
    expect(first.languages).toEqual(["TypeScript"]);
    expect(first.readme).toContain("# Title");
    expect(first.packageJson).toContain("name");
    expect(first.stars).toBe(5);

    const callsAfterFirst = fetchSpy.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    const second = await fetchRepoMetadata("owner", "repo");
    expect(second).toEqual(first);
    expect(fetchSpy.mock.calls.length).toBe(callsAfterFirst);
  });
});
