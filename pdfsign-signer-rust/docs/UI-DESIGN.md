# Brief thiết kế UI — PDFSign 0.2

Ứng dụng desktop Windows ký số PDF (Tauri). Mục tiêu: cảm giác SaaS chuyên nghiệp (Linear / Notion / Acrobat Sign / DocuSign), tiếng Việt ngắn gọn, ít chữ phụ.

## Tham chiếu (nghiên cứu)

| Nguồn | Pattern lấy |
| --- | --- |
| **Linear** (Refero) | Sidebar hẹp + icon, danh sách trạng thái có badge màu, settings dạng card/list gọn, mật độ thông tin cao nhưng yên |
| **Notion** (style Refero) | Nền giấy trắng/`#f9f9f8`, action xanh `#0075de`, nút góc 8px không pill, Inter, khoảng cách 8/16/24 |
| **Dub** (Refero settings) | Settings 2 cột: sidebar + vùng nội dung rộng, banner/status rõ, thẻ trạng thái |
| **Rox / Lemon Squeezy** (Refero) | Dropzone dashed, modal upload tập trung, empty state giữa màn hình, stepper ngang |
| **Dropbox / Mercury** (flows) | Luồng file: empty → chọn → progress → kết quả; feedback từng bước |
| Acrobat Sign / DocuSign (mô hình sản phẩm) | Preview PDF lớn làm “sân khấu”, rail thumbnail trang, đặt ô chữ ký trực tiếp trên trang, PIN/xác thực tách modal |

Hướng chủ đạo: **Linear shell + Notion surface + DocuSign workspace** (preview lớn). Không trung bình hoá palette tím/cream AI-slop.

## Layout

```
┌────────┬──────────────────────────────────────────────┐
│ Logo   │ Header: tiêu đề màn · stepper (Ký số) · CTA │
│ Nav    ├──────────────────────────────────────────────┤
│ icon+  │                                              │
│ nhãn   │  Workspace (preview / form / cards)          │
│        │                                              │
│ v0.2   │                                              │
└────────┴──────────────────────────────────────────────┘
```

- Sidebar cố định ~220px, nền navy (`#0f172a`), mục active có nền nhẹ + viền sáng bo góc; logo ô vuông đỏ + dấu ✓ trắng.
- Header mỏng 52px, tách trắng, hairline dưới.
- **Ký số**: cột trái ~320px (file / ô / token / tuỳ chọn) + viewer lớn; stepper 4 bước trên header.
- **Xác minh / Cài đặt**: một cột nội dung max-width ~880px căn giữa hoặc full với padding 24.
- **Mẫu chữ ký**: list mẫu hẹp + editor 2 cột (fields | live preview).

## Palette (light primary)

| Token | Hex | Vai trò |
| --- | --- | --- |
| `--bg` | `#f4f4f5` | Nền app |
| `--surface` | `#ffffff` | Panel, card, modal |
| `--surface-2` | `#f9f9f8` | Vùng phụ, dropzone |
| `--ink` | `#111114` | Chữ chính |
| `--muted` | `#71717a` | Nhãn, meta |
| `--line` | `#e4e4e7` | Viền hairline |
| `--accent` | `#e11d48` | Primary brand đỏ (nút, stepper, focus, ô chữ ký) |
| `--accent-soft` | `#fff1f2` | Hover/secondary |
| `--ok` / soft | `#15803d` / `#ecfdf5` | Hợp lệ |
| `--warn` / soft | `#b45309` / `#fffbeb` | Cần lưu ý |
| `--bad` / soft | `#b91c1c` / `#fef2f2` | Không hợp lệ |
| `--sidebar` | `#0f172a` | Nav |
| `--sidebar-text` | `#a1a1aa` | Nav inactive |

Dark theme (tùy chọn, `data-theme="dark"`): đảo nền tối, giữ accent đỏ brand. Badge invalid dùng burgundy (`#7f1d1d`) + dấu ✕ để tách khỏi brand crimson.

## Typography

- Font: **Inter** (woff2 bundled offline) — hỗ trợ tiếng Việt tốt.
- Scale: 12 caption · 13 body/control · 14 nav · 16 section · 20 page title.
- Weight: 400 body, 500 control/nav, 600 title/button.
- Không dùng chữ giải thích dưới field; placeholder ngắn nếu cần.

## Spacing & radius

- Scale: 4 / 8 / 12 / 16 / 24 / 32.
- Radius: control `8`, card `12`, modal `16`, badge `6`.
- Shadow: `sm` = `0 1px 2px rgba(0,0,0,.06)`; `md` = `0 8px 24px rgba(0,0,0,.08)` (modal/toast).

## Components

| Component | Quy ước |
| --- | --- |
| Button | Primary filled accent; secondary ghost viền; danger soft đỏ; cao ~36px |
| Input / Select | Viền `--line`, focus ring accent 2px; label ngắn phía trên |
| Card | Surface + border, không bóng trừ khi nổi (modal) |
| Badge | `valid` xanh · `warning` hổ phách · `invalid` đỏ · `level` xám |
| Toast | Góc phải dưới, auto-hide |
| Dialog | Overlay 40% đen, modal giữa, Esc đóng; PIN dùng dialog này |
| Empty state | Icon lucide + 1 dòng + 1 CTA |
| Stepper | 4 bước số tròn: Files → Vị trí → Token → Ký |
| Dropzone | Dashed border, hover accent; kéo thả PDF |
| Progress | Thanh mỏng + text trạng thái |

## Màn hình & trạng thái

1. **Ký số** — empty dropzone; file list; đặt ô trên preview (rail thumbnail, zoom, fit width); chọn token/mẫu/mức; modal PIN; progress; danh sách kết quả (Mở / Thư mục / Xác minh).
2. **Xác minh** — dropzone; summary badge; card chữ ký expandable.
3. **Mẫu chữ ký** — list + form + preview cạnh nhau.
4. **Cài đặt** — TSA, mặc định ký, CA gốc, token đã nhớ.

## Microcopy & UX

- Tiếng Việt, nhãn ngắn: “Ký số”, “Dò token”, “Mã PIN”.
- Không dòng phụ kiểu “X — không Y”.
- Phím tắt: `Ctrl+O` mở file, `Ctrl+Enter` ký, `1–4` chuyển tab, `Esc` đóng modal.
- Motion: 120–180ms ease trên hover/panel; không animation ồn.

## Icon & cửa sổ

- Lucide SVG inline (PenLine, Stamp, ShieldCheck, Settings, …).
- Window title: `PDFSign`. Product / exe: `PDFSign.exe` (`mainBinaryName`).
