"use client";

import { useMemo, useState } from "react";
import { ageHours, formatOpened, formatRelative, STATUS_LABEL } from "@/lib/format";
import type { PrBoardPayload, PrStatus, PullRequestRow } from "@/lib/types";

type StatusFilter = "needs_attention" | "all_open" | PrStatus | "all";

const DEFAULT_FILTER: StatusFilter = "needs_attention";

function matchesFilter(pr: PullRequestRow, filter: StatusFilter): boolean {
  switch (filter) {
    case "needs_attention":
      return pr.status === "ready_for_review" || pr.status === "in_review";
    case "all_open":
      return pr.status !== "merged" && pr.status !== "closed";
    case "all":
      return true;
    default:
      return pr.status === filter;
  }
}

function reviewLoad(prs: PullRequestRow[], members: string[]): Array<{ login: string; count: number }> {
  const counts = new Map<string, number>();
  for (const member of members) counts.set(member, 0);
  for (const pr of prs) {
    if (pr.status !== "ready_for_review" && pr.status !== "in_review") continue;
    for (const reviewer of pr.reviewers) {
      counts.set(reviewer, (counts.get(reviewer) ?? 0) + 1);
    }
    for (const requested of pr.requestedReviewers) {
      if (!pr.reviewers.includes(requested)) {
        counts.set(requested, (counts.get(requested) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .map(([login, count]) => ({ login, count }))
    .sort((a, b) => b.count - a.count || a.login.localeCompare(b.login));
}

export function ReviewBoard({ initial }: { initial: PrBoardPayload }) {
  const [data, setData] = useState(initial);
  const [filter, setFilter] = useState<StatusFilter>(DEFAULT_FILTER);
  const [author, setAuthor] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => {
    return data.prs
      .filter((pr) => matchesFilter(pr, filter))
      .filter((pr) => (author === "all" ? true : pr.author === author))
      .sort((a, b) => {
        const rank = (status: PrStatus) => {
          switch (status) {
            case "ready_for_review":
              return 0;
            case "in_review":
              return 1;
            case "draft":
              return 2;
            case "merged":
              return 3;
            case "closed":
              return 4;
            default: {
              const _exhaustive: never = status;
              return _exhaustive;
            }
          }
        };
        const byStatus = rank(a.status) - rank(b.status);
        if (byStatus !== 0) return byStatus;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
  }, [data.prs, filter, author]);

  const load = useMemo(
    () => reviewLoad(data.prs, data.members),
    [data.prs, data.members],
  );

  const counts = useMemo(() => {
    const base = {
      needs_attention: 0,
      all_open: 0,
      draft: 0,
      ready_for_review: 0,
      in_review: 0,
      merged: 0,
      closed: 0,
      all: data.prs.length,
    };
    for (const pr of data.prs) {
      base[pr.status] += 1;
      if (pr.status !== "merged" && pr.status !== "closed") base.all_open += 1;
      if (pr.status === "ready_for_review" || pr.status === "in_review") {
        base.needs_attention += 1;
      }
    }
    return base;
  }, [data.prs]);

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch("/api/prs", { cache: "no-store" });
      if (!response.ok) throw new Error(`Refresh failed (${response.status})`);
      const next = (await response.json()) as PrBoardPayload;
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="page">
      <header className="header">
        <div>
          <p className="eyebrow">GrowthBook · experiment-squad</p>
          <h1>PR review board</h1>
          <p className="lede">
            Daily triage for open pull requests. Click a title to open GitHub and
            update assignees or reviewers there.
          </p>
        </div>
        <div className="header-actions">
          <div className="meta">
            <span className={`pill source-${data.source}`}>
              {data.source === "github" ? "Live GitHub" : "Sample data"}
            </span>
            <span className="muted">
              Updated {formatRelative(data.fetchedAt)} · {formatOpened(data.fetchedAt)}
            </span>
          </div>
          <button type="button" className="btn" onClick={refresh} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {data.warning ? <div className="banner">{data.warning}</div> : null}
      {error ? <div className="banner error">{error}</div> : null}

      <section className="load">
        <h2>Review load</h2>
        <p className="section-note">
          People involved on ready / in-review PRs (requested or already reviewing).
        </p>
        <div className="load-grid">
          {load.map((row) => (
            <div key={row.login} className="load-card">
              <span className="load-name">{row.login}</span>
              <span className="load-count">{row.count}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="filters">
        <div className="filter-group" role="tablist" aria-label="Status filter">
          {(
            [
              ["needs_attention", "Needs attention"],
              ["ready_for_review", "Ready to review"],
              ["in_review", "In review"],
              ["draft", "Draft"],
              ["all_open", "All open"],
              ["merged", "Merged"],
              ["all", "Everything"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              className={filter === value ? "chip active" : "chip"}
              onClick={() => setFilter(value)}
            >
              {label}
              <span className="chip-count">{counts[value]}</span>
            </button>
          ))}
        </div>
        <label className="author-filter">
          Author
          <select value={author} onChange={(e) => setAuthor(e.target.value)}>
            <option value="all">All squad authors</option>
            {data.members.map((member) => (
              <option key={member} value={member}>
                {member}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>PR</th>
              <th>Opened</th>
              <th>Status</th>
              <th>Author</th>
              <th>Assignees</th>
              <th>Reviewers</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((pr) => {
              const stale = ageHours(pr.createdAt) >= 72 && pr.status === "ready_for_review";
              return (
                <tr key={pr.url} className={stale ? "stale" : undefined}>
                  <td className="title-cell">
                    <a href={pr.url} target="_blank" rel="noreferrer">
                      {pr.title}
                    </a>
                    <div className="sub">
                      {pr.repository}#{pr.number}
                    </div>
                  </td>
                  <td>
                    <div>{formatOpened(pr.createdAt)}</div>
                    <div className="sub">{formatRelative(pr.createdAt)}</div>
                  </td>
                  <td>
                    <span className={`status status-${pr.status}`}>
                      {STATUS_LABEL[pr.status]}
                    </span>
                  </td>
                  <td>
                    <a
                      className="person"
                      href={`https://github.com/${pr.author}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {pr.author}
                    </a>
                  </td>
                  <td>
                    {pr.assignees.length === 0 ? (
                      <span className="empty">—</span>
                    ) : (
                      <div className="people">
                        {pr.assignees.map((a) => (
                          <a
                            key={a.login}
                            className="person"
                            href={a.url ?? `https://github.com/${a.login}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {a.login}
                          </a>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    {pr.reviewers.length === 0 ? (
                      <span className="empty">—</span>
                    ) : (
                      <div className="people">
                        {pr.reviewers.map((login) => (
                          <a
                            key={login}
                            className="person"
                            href={`https://github.com/${login}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {login}
                          </a>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 ? (
          <p className="empty-state">No pull requests match this filter.</p>
        ) : null}
      </div>
    </div>
  );
}
