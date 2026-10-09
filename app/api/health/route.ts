import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { getD1Database, usesD1AppData } from "../../../lib/d1-bindings";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  const backend = usesD1AppData() ? "d1" : "supabase";
  try {
    if (backend === "d1") {
      await (await getD1Database()).prepare("SELECT 1 FROM categories LIMIT 1").first();
    } else {
      const supabase = await createClient();
      const { error } = await supabase.from("categories").select("id", { count: "exact", head: true });
      if (error) throw error;
    }
    return NextResponse.json({ status: "ok", database: "ok", backend, elapsedMs: Date.now() - startedAt }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "degraded", database: "unavailable", backend, elapsedMs: Date.now() - startedAt }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

