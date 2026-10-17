import { NextResponse } from "next/server";
import { getAudit } from "@/lib/mockStore";

export const dynamic = "force-dynamic";

export async function GET() { return NextResponse.json(getAudit()); }
