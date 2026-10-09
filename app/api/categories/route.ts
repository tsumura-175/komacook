import { NextResponse } from "next/server";
import { getD1Database, usesD1AppData } from "../../../lib/d1-bindings";
import { createClient } from "../../../lib/supabase/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/** 公開・編集フォーム共通の有効カテゴリ一覧。D1切替中も読取元を一つに保つ。 */
export async function GET() {
  try {
    if (usesD1AppData()) {
      const categories = (await (await getD1Database())
        .prepare("SELECT id, name FROM categories WHERE is_active = 1 ORDER BY sort_order, name")
        .all<{ id: string; name: string }>()).results ?? [];
      return NextResponse.json({ categories }, { headers: { "Cache-Control": "no-store" } });
    }

    const supabase = await createClient();
    const { data, error } = await supabase.from("categories").select("id, name").eq("is_active", true).order("sort_order");
    if (error) throw error;
    return NextResponse.json({ categories: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ categories: [] }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
