type GithubFeed = {
  provider: "github"
  owner: string
  repo: string
}

type GenericFeed = {
  provider: "generic"
  url: string
}

export type UpdateFeed = GithubFeed | GenericFeed

export function parseGithubRepo(repositoryUrl: string | undefined): {
  owner: string
  repo: string
} | null {
  if (!repositoryUrl) {
    return null
  }
  try {
    const url = new URL(repositoryUrl.replace(/\.git$/, ""))
    if (!url.hostname.endsWith("github.com")) {
      return null
    }
    const [owner, repo] = url.pathname.split("/").filter(Boolean)
    if (!owner || !repo) {
      return null
    }
    return { owner, repo }
  } catch {
    return null
  }
}

export function resolveUpdateFeed(input: {
  settingsUrl?: string
  envUrl?: string
  repositoryUrl?: string
}): UpdateFeed | null {
  const generic = input.settingsUrl?.trim() || input.envUrl?.trim()
  if (generic) {
    return { provider: "generic", url: generic.replace(/\/$/, "") }
  }
  const github = parseGithubRepo(input.repositoryUrl)
  if (!github) {
    return null
  }
  return { provider: "github", owner: github.owner, repo: github.repo }
}
