import { signOut } from "@/app/admin/actions";

export function AdminLogoutButton() {
  return (
    <form action={signOut}>
      <button className="admin-nav-button" type="submit">
        Sign Out
      </button>
    </form>
  );
}
