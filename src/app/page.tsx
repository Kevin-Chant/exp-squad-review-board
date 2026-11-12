import { ReviewBoard } from "@/components/ReviewBoard";
import { loadPrBoard } from "@/lib/github";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const initial = await loadPrBoard();
  return <ReviewBoard initial={initial} />;
}
