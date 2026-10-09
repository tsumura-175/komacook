import { NextRequest, NextResponse } from "next/server";
import { getD1Database, getImageBucket, isSafeImageKey } from "../../../lib/d1-bindings";
import { createClient } from "../../../lib/supabase/server";

export const runtime = "edge";

async function isPublicRecipeImage(db: D1Database, key: string) {
  const row = await db.prepare(`
    SELECT 1
    FROM recipes AS recipe
    WHERE recipe.visibility = 'public'
      AND recipe.status = 'published'
      AND recipe.deleted_at IS NULL
      AND (
        recipe.image_key = ?
        OR EXISTS (
          SELECT 1 FROM recipe_steps AS step
          WHERE step.recipe_id = recipe.id AND step.image_key = ?
        )
      )
    LIMIT 1
  `).bind(key, key).first();
  return Boolean(row);
}

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key") ?? "";
  if (!isSafeImageKey(key)) return new NextResponse("Not found", { status: 404 });

  const db = await getD1Database();
  const publiclyReadable = await isPublicRecipeImage(db, key);
  if (!publiclyReadable) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user || !key.startsWith(`${data.user.id}/`)) return new NextResponse("Not found", { status: 404 });
  }

  const bucket = await getImageBucket();
  const image = await bucket.get(key);
  if (!image) return new NextResponse("Not found", { status: 404 });

  const headers = new Headers();
  headers.set("Content-Type", image.httpMetadata?.contentType ?? "image/webp");
  headers.set("ETag", image.httpEtag);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cache-Control", publiclyReadable ? "public, max-age=3600, immutable" : "private, no-store");
  return new NextResponse(image.body, { headers });
}
