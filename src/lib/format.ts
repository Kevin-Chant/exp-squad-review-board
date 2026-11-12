import type { PrStatus } from "@/lib/types";

export const STATUS_LABEL: Record<PrStatus, string> = {
  draft: "Draft",
  ready_for_review: "Ready to review",
  in_review: "In review",
  merged: "Merged",
  closed: "Closed",
};

export function formatOpened(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1d ago";
  if (days < 14) return `${days}d ago`;
  return formatOpened(iso);
}

export function ageHours(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60);
}
