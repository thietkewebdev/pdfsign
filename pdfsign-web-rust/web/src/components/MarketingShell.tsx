import { Link, NavLink } from "react-router-dom";
import { BrandLockup } from "./Brand";
import type { User } from "../api";

export default function MarketingShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: User | null;
}) {
  return (
    <div className="mkt">
      <header className="mkt-header">
        <div className="mkt-header-inner">
          <Link to="/" style={{ textDecoration: "none" }}>
            <BrandLockup />
          </Link>
          <nav className="mkt-nav">
            <a href="/#cach-lam">Cách làm</a>
            <a href="/#tinh-nang">Tính năng</a>
            <a href="/#bang-gia">Bảng giá</a>
            <NavLink to="/verify">Xác minh</NavLink>
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
                  Đăng ký
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <div className="mkt-main">{children}</div>
      <footer className="mkt-footer">
        <div className="mkt-footer-inner">
          <div>
            <BrandLockup />
            <p className="muted" style={{ marginTop: 12 }}>
              Ký số PDF bằng USB token.
            </p>
          </div>
          <div>
            <strong>Sản phẩm</strong>
            <a href="/#cach-lam">Cách làm</a>
            <a href="/#tai-app">Tải app</a>
            <Link to="/verify">Xác minh</Link>
            <a href="/#bang-gia">Bảng giá</a>
          </div>
          <div>
            <strong>Tài khoản</strong>
            <Link to="/login">Đăng nhập</Link>
            <Link to="/register">Đăng ký</Link>
            <Link to="/documents">Tài liệu</Link>
          </div>
          <div>
            <strong>Liên hệ</strong>
            <a href="mailto:info@pdfsign.vn">info@pdfsign.vn</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
