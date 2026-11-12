import sample from "@/data/sample-prs.json";
import type { PrBoardPayload, PrStatus, PullRequestRow } from "@/lib/types";

const ORG = "growthbook";
const TEAM_SLUG = "experiment-squad";
const TEAM_DISPLAY = "experiment-squad";

const SEARCH_QUERY = `
query SquadPrSearch($search: String!, $after: String) {
  search(query: $search, type: ISSUE, first: 50, after: $after) {
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      ... on PullRequest {
        number
        title
        url
        createdAt
        updatedAt
        isDraft
        merged
        closed
        author {
          login
        }
        repository {
          nameWithOwner
        }
        assignees(first: 10) {
          nodes {
            login
            avatarUrl
            url
          }
        }
        reviewRequests(first: 20) {
          nodes {
            requestedReviewer {
              ... on User {
                login
              }
              ... on Team {
                combinedSlug
              }
            }
          }
        }
        reviews(first: 50) {
          nodes {
            author {
              login
            }
            state
            submittedAt
          }
        }
        comments(first: 50) {
          nodes {
            author {
              login
            }
          }
        }
      }
    }
  }
}
`;

type GqlUser = { login: string; avatarUrl?: string; url?: string };
type GqlReviewer =
  | { login: string; combinedSlug?: undefined }
  | { login?: undefined; combinedSlug: string }
  | null;

type GqlPr = {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  isDraft: boolean;
  merged: boolean;
  closed: boolean;
  author: { login: string } | null;
  repository: { nameWithOwner: string };
  assignees: { nodes: GqlUser[] };
  reviewRequests: {
    nodes: Array<{ requestedReviewer: GqlReviewer }>;
  };
  reviews: {
    nodes: Array<{
      author: { login: string } | null;
      state: string;
      submittedAt: string | null;
    }>;
  };
  comments: {
    nodes: Array<{ author: { login: string } | null }>;
  };
};

const BOT_LOGINS = new Set([
  "github-actions",
  "dependabot",
  "dependabot[bot]",
  "greptile-apps",
  "greptile-apps[bot]",
  "cursor",
  "cursor[bot]",
  "mintlify",
  "mintlify[bot]",
  "vercel",
  "vercel[bot]",
  "netlify",
  "netlify[bot]",
  "codecov",
  "codecov[bot]",
  "renovate",
  "renovate[bot]",
]);

function isBot(login: string | null | undefined): boolean {
  if (!login) return true;
  const normalized = login.toLowerCase();
  if (BOT_LOGINS.has(normalized)) return true;
  return (
    normalized.endsWith("[bot]") ||
    normalized.endsWith("-bot") ||
    normalized.includes("[bot]")
  );
}

function deriveStatus(pr: GqlPr): PrStatus {
  if (pr.merged) return "merged";
  if (pr.closed) return "closed";
  if (pr.isDraft) return "draft";

  const author = pr.author?.login;
  const hasHumanReview = pr.reviews.nodes.some((review) => {
    const login = review.author?.login;
    return (
      !!login &&
      login !== author &&
      !isBot(login) &&
      review.state !== "PENDING"
    );
  });
  const hasComment = pr.comments.nodes.some((comment) => {
    const login = comment.author?.login;
    return !!login && login !== author && !isBot(login);
  });

  if (hasHumanReview || hasComment) return "in_review";
  return "ready_for_review";
}

function toRow(pr: GqlPr): PullRequestRow {
  const author = pr.author?.login ?? "unknown";
  const requestedReviewers: string[] = [];
  for (const node of pr.reviewRequests.nodes) {
    const reviewer = node.requestedReviewer;
    if (!reviewer) continue;
    if ("login" in reviewer && reviewer.login) {
      requestedReviewers.push(reviewer.login);
    } else if ("combinedSlug" in reviewer && reviewer.combinedSlug) {
      requestedReviewers.push(reviewer.combinedSlug);
    }
  }

  const involved = new Set<string>();
  for (const login of requestedReviewers) involved.add(login);
  for (const review of pr.reviews.nodes) {
    if (review.author?.login && !isBot(review.author.login)) {
      involved.add(review.author.login);
    }
  }
  for (const comment of pr.comments.nodes) {
    if (comment.author?.login && !isBot(comment.author.login)) {
      involved.add(comment.author.login);
    }
  }
  involved.delete(author);

  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    createdAt: pr.createdAt,
    updatedAt: pr.updatedAt,
    author,
    repository: pr.repository.nameWithOwner,
    isDraft: pr.isDraft,
    status: deriveStatus(pr),
    assignees: pr.assignees.nodes.map((a) => ({
      login: a.login,
      avatarUrl: a.avatarUrl,
      url: a.url,
    })),
    requestedReviewers,
    reviewers: [...involved],
  };
}

async function githubGraphql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "exp-squad-review-board",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub GraphQL HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  const json = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) {
    throw new Error("GitHub GraphQL returned no data");
  }
  return json.data;
}

async function fetchTeamMembers(token: string): Promise<string[]> {
  const query = `
    query($org: String!, $slug: String!) {
      organization(login: $org) {
        team(slug: $slug) {
          members(first: 50) {
            nodes { login }
          }
        }
      }
    }
  `;
  const data = await githubGraphql<{
    organization: {
      team: { members: { nodes: Array<{ login: string }> } } | null;
    } | null;
  }>(token, query, { org: ORG, slug: TEAM_SLUG });

  const members = data.organization?.team?.members.nodes.map((m) => m.login) ?? [];
  if (members.length === 0) {
    throw new Error(`No members found for ${ORG}/${TEAM_SLUG}`);
  }
  return members;
}

type SearchResult = {
  search: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<GqlPr | Record<string, never>>;
  };
};

async function searchPrs(
  token: string,
  search: string,
): Promise<GqlPr[]> {
  const rows: GqlPr[] = [];
  let after: string | null = null;
  for (let page = 0; page < 4; page += 1) {
    const data: SearchResult = await githubGraphql<SearchResult>(
      token,
      SEARCH_QUERY,
      { search, after },
    );

    for (const node of data.search.nodes) {
      if (node && "number" in node && typeof node.number === "number") {
        rows.push(node as GqlPr);
      }
    }
    if (!data.search.pageInfo.hasNextPage) break;
    after = data.search.pageInfo.endCursor;
  }
  return rows;
}

function dedupe(rows: PullRequestRow[]): PullRequestRow[] {
  const map = new Map<string, PullRequestRow>();
  for (const row of rows) map.set(row.url, row);
  return [...map.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function loadPrBoard(): Promise<PrBoardPayload> {
  const token = process.env.GITHUB_TOKEN?.trim() ?? "";

  if (!token) {
    const samplePayload = sample as PrBoardPayload;
    return {
      ...samplePayload,
      source: "sample",
      warning:
        "Showing sample GitHub data. Bind a GITHUB_TOKEN secret with repo + read:org access to sync live.",
    };
  }

  try {
    const members = await fetchTeamMembers(token);
    // GitHub search treats multiple author: qualifiers poorly when OR-grouped in
    // GraphQL; fetch each squad author separately and merge.
    const searches = members.flatMap((member) => [
      searchPrs(token, `org:${ORG} is:pr is:open author:${member}`),
      searchPrs(
        token,
        `org:${ORG} is:pr is:merged merged:>=${daysAgo(14)} author:${member}`,
      ),
    ]);
    const pages = await Promise.all(searches);
    const prs = dedupe(pages.flat().map(toRow));

    return {
      fetchedAt: new Date().toISOString(),
      team: TEAM_DISPLAY,
      members,
      prs,
      source: "github",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown GitHub error";
    const samplePayload = sample as PrBoardPayload;
    return {
      ...samplePayload,
      source: "sample",
      warning: `GitHub sync failed (${message}). Showing sample data.`,
    };
  }
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
