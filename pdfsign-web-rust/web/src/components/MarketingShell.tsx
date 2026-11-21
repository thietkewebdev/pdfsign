import { Link, NavLink } from "react-router-dom";
import { BrandLockup } from "./Brand";
import type { User } from "../api";
import { HOME, HOME_FACTS, WINDOWS_INSTALLER_URL } from "../homeContent";

export default function MarketingShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: User | null;
}) {
  const companyLine = [
    HOME.company.name,
    `MST: ${HOME.company.taxId}`,
    HOME_FACTS.address ? `Địa chỉ: ${HOME_FACTS.address}` : null,
    HOME_FACTS.hotline ? `Hotline: ${HOME_FACTS.hotline}` : null,
    HOME.company.email,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mkt home-theme">
      <header className="mkt-header">
        <div className="mkt-header-inner">
          <Link to="/" style={{ textDecoration: "none" }}>
            <BrandLockup />
          </Link>
          <nav className="mkt-nav">
            {HOME.nav.map((l) => (
              <a key={l.href} href={l.href}>
                {l.label}
              </a>
            ))}
          </nav>
          <div className="mkt-actions">
            {user ? (
              <>
                <Link className="btn btn-ghost btn-sm" to="/dashboard">
                  Bảng điều khiển
                </Link>
                <Link className="btn btn-primary btn-sm" to="/documents">
                  Tài liệu
                </Link>
              </>
            ) : (
              <>
                <Link className="btn btn-ghost btn-sm" to="/login">
                  Đăng nhập
                </Link>
                <Link className="btn btn-primary btn-sm" to="/register">
                  Dùng thử miễn phí
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <div className="mkt-main">{children}</div>
      <footer className="mkt-footer">
        <div className="mkt-footer-inner" style={{ gridTemplateColumns: "1.5fr 1fr 1fr 1fr" }}>
          <div>
            <BrandLockup dark />
            <p className="muted" style={{ marginTop: 12, color: "#94a3b8" }}>
              {HOME.footer.tagline}
            </p>
          </div>
          <div>
            <strong>Sản phẩm</strong>
            {HOME.footer.product.map((l) =>
              l.href.startsWith("http") || l.href.startsWith("mailto") ? (
                <a key={l.label} href={l.href === "/#tai-app" ? WINDOWS_INSTALLER_URL : l.href}>
                  {l.label}
                </a>
              ) : l.href.startsWith("/#") || l.href.startsWith("#") ? (
                <a key={l.label} href={l.href === "/#tai-app" ? "/#tai-app" : l.href}>
                  {l.label}
                </a>
              ) : (
                <Link key={l.label} to={l.href}>
                  {l.label}
                </Link>
              ),
            )}
          </div>
          <div>
            <strong>Hỗ trợ</strong>
            {HOME.footer.support.map((l) =>
              l.href.startsWith("mailto") || l.href.startsWith("/#") ? (
                <a key={l.label} href={l.href}>
                  {l.label}
                </a>
              ) : (
                <Link key={l.label} to={l.href}>
                  {l.label}
                </Link>
              ),
            )}
          </div>
          <div>
            <strong>Pháp lý</strong>
            {HOME.footer.legal.map((l) => (
              <a key={l.label} href={l.href}>
                {l.label}
              </a>
            ))}
          </div>
        </div>
        <div className="home-wrap foot-legal">
          <div>{companyLine}</div>
          <div>© 2026 PDFSign</div>
        </div>
      </footer>
    </div>
  );
}
