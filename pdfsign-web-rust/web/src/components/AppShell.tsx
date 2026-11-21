import { NavLink } from "react-router-dom";
import { BrandLockup } from "./Brand";
import type { User } from "../api";

const links = [
  { to: "/dashboard", label: "Tổng quan" },
  { to: "/documents", label: "Tài liệu" },
  { to: "/verify", label: "Xác minh" },
  { to: "/settings", label: "Cài đặt" },
];

export default function AppShell({
  user,
  onLogout,
  children,
}: {
  user: User;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <BrandLockup dark />
        <nav className="nav">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? "active" : "")}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</div>
          <button className="btn btn-ghost btn-sm" style={{ color: "#e2e8f0", borderColor: "#334155", marginTop: 8 }} onClick={onLogout}>
            Đăng xuất
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
