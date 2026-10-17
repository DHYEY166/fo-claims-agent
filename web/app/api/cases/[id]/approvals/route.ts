import { NextResponse } from "next/server";
import { decide } from "@/lib/mockStore";
import type { ApprovalBody } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as ApprovalBody | null;
  if (!body?.event_id || !["approve", "reject"].includes(body.decision))
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const r = decide(id, body);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r);
}
