import { loadPrBoard } from "@/lib/github";

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await loadPrBoard();
  return Response.json(payload, {
    headers: {
      "cache-control": "private, no-store",
    },
  });
}
