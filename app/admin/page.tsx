import { AdminLayout } from "@/components/AdminLayout";
import { createClient } from "@/lib/supabase/server";

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  let importedVideos = 0;
  let draftArticles = 0;
  let publishedArticles = 0;
  let errorMessage = "";

  if (supabase) {
    const [videosResult, draftsResult, publishedResult] = await Promise.all([
      supabase.from("videos").select("id", { count: "exact", head: true }),
      supabase
        .from("articles")
        .select("id", { count: "exact", head: true })
        .eq("status", "draft"),
      supabase
        .from("articles")
        .select("id", { count: "exact", head: true })
        .eq("status", "published"),
    ]);

    importedVideos = videosResult.count || 0;
    draftArticles = draftsResult.count || 0;
    publishedArticles = publishedResult.count || 0;
    errorMessage =
      videosResult.error?.message ||
      draftsResult.error?.message ||
      publishedResult.error?.message ||
      "";
  }

  return (
    <AdminLayout>
      <div className="admin-card">
        <p className="eyebrow">Dashboard</p>
        <h1>Publishing workflow overview</h1>
        <p>Supabase-backed overview for imported videos and review drafts.</p>
      </div>
      {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
      <div className="stats">
        <div className="admin-card stat">
          <strong>{importedVideos}</strong>
          <p>Imported videos</p>
        </div>
        <div className="admin-card stat">
          <strong>{draftArticles}</strong>
          <p>Draft reviews</p>
        </div>
        <div className="admin-card stat">
          <strong>{publishedArticles}</strong>
          <p>Published reviews</p>
        </div>
      </div>
      <div className="admin-card">
        <h2>Next connections</h2>
        <div className="tag-list">
          <span className="tag">Public Supabase reviews</span>
          <span className="tag">Admin video import</span>
          <span className="tag">YouTube metadata</span>
          <span className="tag">Caption draft generator</span>
          <span className="tag">YouTube description updates</span>
        </div>
      </div>
    </AdminLayout>
  );
}
