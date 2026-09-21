import { NextResponse } from "next/server";
import { getSiteUrl } from "../../../lib/site-url";
import { hasSupabaseConfig } from "../../../lib/supabase/config";
import { createClient } from "../../../lib/supabase/server";

export async function GET() {
  if (hasSupabaseConfig()) await (await createClient()).auth.signOut();
  return NextResponse.redirect(`${getSiteUrl()}/login`);
}

