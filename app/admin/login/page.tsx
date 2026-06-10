import { Suspense } from "react";
import { AdminLoginForm } from "@/components/AdminLoginForm";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function AdminLoginPage() {
  const hasSupabaseConfig = isSupabaseConfigured();

  return (
    <main className="admin-shell">
      <div className="admin-inner">
        <div className="admin-card" style={{ maxWidth: 520 }}>
          <p className="eyebrow">Admin login</p>
          <h1>RunPlayBack admin</h1>
          {hasSupabaseConfig ? (
            <>
              <Suspense fallback={<p>Loading login...</p>}>
                <AdminLoginForm />
              </Suspense>
            </>
          ) : (
            <div className="setup-note">
              <p>
                Supabase is wired in, but the project keys are not added yet.
                Add them to `.env.local` to enable admin login.
              </p>
              <code>NEXT_PUBLIC_SUPABASE_URL</code>
              <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
