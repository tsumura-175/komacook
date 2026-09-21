import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("categories").select("id", { count: "exact", head: true });
    if (error) throw error;
    return NextResponse.json({ status: "ok", database: "ok", elapsedMs: Date.now() - startedAt }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "degraded", database: "unavailable", elapsedMs: Date.now() - startedAt }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

