import { describe, expect, it } from "vitest"

import { parseGithubRepo, resolveUpdateFeed } from "./update-feed"

describe("parseGithubRepo", () => {
  it("reads owner and repo from a github url", () => {
    expect(
      parseGithubRepo("https://github.com/fastapi-practices/fba-buddy.git")
    ).toEqual({ owner: "fastapi-practices", repo: "fba-buddy" })
  })

  it("returns null for non-github urls", () => {
    expect(parseGithubRepo("https://example.com/app")).toBeNull()
  })
})

describe("resolveUpdateFeed", () => {
  it("prefers a custom generic url over github", () => {
    expect(
      resolveUpdateFeed({
        settingsUrl: "https://updates.example.com/buddy/",
        repositoryUrl: "https://github.com/fastapi-practices/fba-buddy",
      })
    ).toEqual({
      provider: "generic",
      url: "https://updates.example.com/buddy",
    })
  })

  it("falls back to github releases", () => {
    expect(
      resolveUpdateFeed({
        repositoryUrl: "https://github.com/fastapi-practices/fba-buddy",
      })
    ).toEqual({
      provider: "github",
      owner: "fastapi-practices",
      repo: "fba-buddy",
    })
  })
})
