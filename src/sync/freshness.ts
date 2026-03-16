import { supabase } from "@/lib/supabase";
import { getDb } from "@/platform/adapter";
import { getCurrentUserId } from "./index";

/**
 * Compare the most recent review timestamp locally vs in the cloud.
 * Returns which side is newer, or "equal" if they match.
 */
export async function checkFreshness(): Promise<{
  status: "local-newer" | "cloud-newer" | "equal" | "no-cloud" | "no-user";
  localLatest: string | null;
  cloudLatest: string | null;
}> {
  const userId = await getCurrentUserId();
  if (!userId) return { status: "no-user", localLatest: null, cloudLatest: null };

  // Get latest local review
  const db = getDb();
  const localRows = db.exec<{ latest: string | null }>(
    "SELECT MAX(review_time) as latest FROM review_logs"
  );
  const localLatest = localRows[0]?.latest ?? null;

  // Get latest cloud review
  const { data, error } = await supabase
    .from("review_logs")
    .select("review_time")
    .eq("user_id", userId)
    .order("review_time", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return { status: "no-cloud", localLatest, cloudLatest: null };
  }

  const cloudLatest = data[0]!.review_time as string;

  if (!localLatest && cloudLatest) return { status: "cloud-newer", localLatest, cloudLatest };
  if (localLatest && !cloudLatest) return { status: "local-newer", localLatest, cloudLatest };
  if (!localLatest && !cloudLatest) return { status: "equal", localLatest, cloudLatest };

  const localTime = new Date(localLatest!).getTime();
  const cloudTime = new Date(cloudLatest!).getTime();

  if (Math.abs(localTime - cloudTime) < 1000) {
    return { status: "equal", localLatest, cloudLatest };
  }

  return {
    status: cloudTime > localTime ? "cloud-newer" : "local-newer",
    localLatest,
    cloudLatest,
  };
}