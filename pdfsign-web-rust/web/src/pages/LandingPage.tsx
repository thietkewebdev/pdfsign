import { Link } from "react-router-dom";

export default function LandingPage() {
  return (
    <>
      <section className="hero">
        <div>
          <h1 className="hero-brand">
            PDF<span>Sign</span>
          </h1>
          <p>Ký số PDF bằng USB token. Khóa riêng không rời thiết bị.</p>
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <Link className="btn btn-primary btn-lg" to="/register">
              Bắt đầu
            </Link>
            <Link className="btn btn-ghost btn-lg" to="/verify">
              Xác minh
            </Link>
          </div>
        </div>
        <div className="hero-card">
          <div className="h3" style={{ marginBottom: 12 }}>
            Quy trình
          </div>
          <ol style={{ margin: 0, paddingLeft: 18, color: "var(--muted)", fontSize: 14, lineHeight: 1.7 }}>
            <li>Tải PDF lên</li>
            <li>Đặt ô chữ ký</li>
            <li>Mở app ký với USB token</li>
            <li>Tải file đã ký</li>
          </ol>
        </div>
      </section>

      <section className="section" id="tinh-nang">
        <div className="section-head">
          <h2 className="h2">Tính năng</h2>
        </div>
        <div className="grid-3">
          <div className="feature">
            <div className="icon">1</div>
            <strong>USB token</strong>
            <p className="muted" style={{ margin: "8px 0 0" }}>
              Ký PAdES trên máy local.
            </p>
          </div>
          <div className="feature">
            <div className="icon">2</div>
            <strong>Đặt vị trí</strong>
            <p className="muted" style={{ margin: "8px 0 0" }}>
              Chọn trang và khung chữ ký.
            </p>
          </div>
          <div className="feature">
            <div className="icon">3</div>
            <strong>Xác minh</strong>
            <p className="muted" style={{ margin: "8px 0 0" }}>
              Kiểm tra chữ ký trên PDF.
            </p>
          </div>
        </div>
      </section>

      <section className="section" id="bang-gia">
        <div className="section-head">
          <h2 className="h2">Bảng giá</h2>
        </div>
        <div className="price-grid">
          <div className="price">
            <div className="h3">Cơ bản</div>
            <div className="amt">0đ</div>
            <p className="muted">Thử nghiệm cá nhân</p>
            <Link className="btn btn-ghost" style={{ width: "100%", marginTop: 12 }} to="/register">
              Đăng ký
            </Link>
          </div>
          <div className="price featured">
            <div className="h3">Pro</div>
            <div className="amt">199k</div>
            <p className="muted">Doanh nghiệp nhỏ</p>
            <Link className="btn btn-primary" style={{ width: "100%", marginTop: 12 }} to="/register">
              Chọn Pro
            </Link>
          </div>
          <div className="price">
            <div className="h3">Enterprise</div>
            <div className="amt">Liên hệ</div>
            <p className="muted">Quy mô lớn</p>
            <a className="btn btn-ghost" style={{ width: "100%", marginTop: 12 }} href="mailto:info@pdfsign.vn">
              Liên hệ
            </a>
          </div>
        </div>
      </section>

      <section className="section faq">
        <div className="section-head">
          <h2 className="h2">Câu hỏi thường gặp</h2>
        </div>
        <details open>
          <summary>Chữ ký USB token có hợp pháp không?</summary>
          <p className="muted">Có, theo Luật Giao dịch điện tử và nghị định liên quan.</p>
        </details>
        <details>
          <summary>Khóa riêng có lên server không?</summary>
          <p className="muted">Không. Ký diễn ra trên máy có USB token.</p>
        </details>
        <details>
          <summary>Làm sao kiểm tra file đã ký?</summary>
          <p className="muted">Dùng trang Xác minh hoặc Adobe Acrobat.</p>
        </details>
      </section>
    </>
  );
}
