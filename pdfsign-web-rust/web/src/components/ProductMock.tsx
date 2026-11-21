/** Built product visual: web place-box + desktop signer chrome. */
export default function ProductMock() {
  return (
    <div className="product-stage" aria-hidden>
      <div className="product-app">
        <aside className="product-side">
          <div className="product-brand">
            <span className="brand-mark" style={{ width: 28, height: 28, fontSize: 14 }}>
              ✓
            </span>
            <strong>PDFSign</strong>
          </div>
          <div className="product-nav-item active">Tài liệu</div>
          <div className="product-nav-item">Xác minh</div>
          <div className="product-nav-item">Cài đặt</div>
        </aside>
        <div className="product-main">
          <div className="product-toolbar">
            <span>hop-dong.pdf</span>
            <span className="product-pill">Trang 1</span>
          </div>
          <div className="product-canvas">
            <div className="product-page">
              <div className="product-lines">
                <i /><i /><i /><i /><i /><i />
              </div>
              <div className="product-sig">
                <span>Chữ ký</span>
              </div>
            </div>
            <div className="product-thumbs">
              <b className="on" />
              <b />
            </div>
          </div>
        </div>
      </div>
      <div className="product-desktop">
        <div className="product-desktop-bar">
          <span>PDFSign</span>
          <span className="tiny">USB token</span>
        </div>
        <div className="product-desktop-body">
          <div className="product-token">Viettel-CA</div>
          <div className="product-btn">Ký số</div>
        </div>
      </div>
    </div>
  );
}
