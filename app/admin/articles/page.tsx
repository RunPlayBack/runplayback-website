import Link from "next/link";
import { AdminLayout } from "@/components/AdminLayout";
import { createClient } from "@/lib/supabase/server";
import { createDraftArticle, publishAllDraftArticles } from "./actions";

type AdminArticlesPageProps = {
  searchParams?: Promise<{
    deleted?: string;
    error?: string;
    publishedAll?: string;
  }>;
};

type AdminArticle = {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "published";
  updated_at: string;
};

export default async function AdminArticlesPage({
  searchParams,
}: AdminArticlesPageProps) {
  const resolvedSearchParams = await searchParams;
  const supabase = await createClient();
  let articles: AdminArticle[] = [];
  let errorMessage = resolvedSearchParams?.error;

  if (supabase) {
    const { data, error } = await supabase
      .from("articles")
      .select("id,title,slug,status,updated_at")
      .order("updated_at", { ascending: false });

    if (error) {
      errorMessage = error.message;
    } else {
      articles = data || [];
    }
  }

  return (
    <AdminLayout>
      <div className="admin-card">
        <p className="eyebrow">Reviews</p>
        <h1>Drafts and published reviews</h1>
        <p>Review, edit, publish, and unpublish RunPlayBack reviews.</p>
        <div className="actions">
          <form action={createDraftArticle}>
            <button className="button" type="submit">
              Create Draft Review
            </button>
          </form>
          <form action={publishAllDraftArticles}>
            <button className="button" type="submit">
              Publish All Drafts
            </button>
          </form>
        </div>
      </div>
      {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
      {resolvedSearchParams?.deleted ? (
        <p className="form-success">Review deleted.</p>
      ) : null}
      {resolvedSearchParams?.publishedAll ? (
        <p className="form-success">
          {resolvedSearchParams.publishedAll === "0"
            ? "No draft reviews left to publish."
            : `Published ${resolvedSearchParams.publishedAll} draft review${
                resolvedSearchParams.publishedAll === "1" ? "" : "s"
              }.`}
        </p>
      ) : null}
      <div className="table-list">
        {articles.length ? (
          articles.map((article) => (
            <div className="table-row" key={article.id}>
              <div>
                <strong>{article.title}</strong>
                <p>{article.slug}</p>
              </div>
              <span className={`status ${article.status}`}>{article.status}</span>
              <Link className="button" href={`/admin/articles/${article.id}`}>
                Edit
              </Link>
            </div>
          ))
        ) : (
          <div className="admin-card">
            <h2>No reviews yet</h2>
            <p>Create a draft review to start testing the review workflow.</p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
