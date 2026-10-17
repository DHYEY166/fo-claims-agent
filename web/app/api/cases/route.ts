import { NextResponse } from "next/server";
import { createCase, listCases } from "@/lib/mockStore";
import type { CreateCaseBody } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() { return NextResponse.json(listCases()); }

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as CreateCaseBody | null;
  if (!body || !["paste", "upload", "forward"].includes(body.source) || typeof body.text !== "string")
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  return NextResponse.json(createCase(body), { status: 201 });
}
