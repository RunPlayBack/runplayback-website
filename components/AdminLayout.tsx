import Link from "next/link";
import { AdminLogoutButton } from "./AdminLogoutButton";

const adminLinks = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/videos", label: "Videos" },
  { href: "/admin/popular-videos", label: "Popular Videos" },
  { href: "/admin/articles", label: "Reviews" },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="admin-shell">
      <div className="admin-inner admin-layout">
        <aside className="admin-nav" aria-label="Admin navigation">
          {adminLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
          <AdminLogoutButton />
        </aside>
        <section className="admin-main">{children}</section>
      </div>
    </main>
  );
}
