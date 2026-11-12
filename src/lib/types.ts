export type PrStatus =
  | "draft"
  | "ready_for_review"
  | "in_review"
  | "merged"
  | "closed";

export type Assignee = {
  login: string;
  avatarUrl?: string;
  url?: string;
};

export type PullRequestRow = {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  author: string;
  repository: string;
  isDraft: boolean;
  status: PrStatus;
  assignees: Assignee[];
  requestedReviewers: string[];
  reviewers: string[];
};

export type PrBoardPayload = {
  fetchedAt: string;
  team: string;
  members: string[];
  prs: PullRequestRow[];
  source: "github" | "sample";
  warning?: string;
};
