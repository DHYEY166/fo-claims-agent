import { NextResponse } from "next/server";
import { getCase } from "@/lib/mockStore";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = getCase(id);
  return c ? NextResponse.json(c) : NextResponse.json({ error: "not found" }, { status: 404 });
}
