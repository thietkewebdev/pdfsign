import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chính sách bảo mật",
  description: "Chính sách bảo mật và quyền riêng tư của PDFSignPro Cloud.",
};

export default function PrivacyPage() {
  return (
    <div className="container mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <h1 className="mb-8 text-3xl font-bold tracking-tight sm:text-4xl">
        Chính sách bảo mật
      </h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Cập nhật lần cuối: 15/03/2025
      </p>

      <div className="prose prose-zinc dark:prose-invert max-w-none space-y-8 text-[15px] leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold">1. Thông tin chúng tôi thu thập</h2>
          <p>Khi sử dụng PDFSignPro Cloud, chúng tôi có thể thu thập:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              <strong>Thông tin tài khoản:</strong> Tên, email, ảnh đại diện (từ Google) khi bạn đăng nhập.
            </li>
            <li>
              <strong>Tài liệu PDF:</strong> File bạn tải lên để ký số. Tài liệu được mã hóa khi truyền tải (TLS)
              và lưu trữ trên hạ tầng cloud bảo mật.
            </li>
            <li>
              <strong>Thông tin chữ ký:</strong> Metadata chứng thư số (tên tổ chức, số serial, thời gian ký) —
              chỉ lưu metadata, không lưu khóa riêng.
            </li>
            <li>
              <strong>Dữ liệu kỹ thuật:</strong> Địa chỉ IP, loại trình duyệt, thời gian truy cập
              (phục vụ vận hành và bảo mật).
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">2. Mục đích sử dụng thông tin</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>Cung cấp dịch vụ ký số PDF theo yêu cầu của bạn.</li>
            <li>Xác thực danh tính khi đăng nhập.</li>
            <li>Quản lý tài liệu cá nhân trên dashboard.</li>
            <li>Cải thiện chất lượng dịch vụ và trải nghiệm người dùng.</li>
            <li>Phát hiện và ngăn chặn hành vi lạm dụng.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">3. Bảo mật dữ liệu</h2>
          <p>Chúng tôi áp dụng các biện pháp bảo mật:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              <strong>Mã hóa truyền tải:</strong> Toàn bộ dữ liệu được truyền qua HTTPS/TLS.
            </li>
            <li>
              <strong>Lưu trữ an toàn:</strong> Tài liệu lưu trên Cloudflare R2 với kiểm soát truy cập nghiêm ngặt.
            </li>
            <li>
              <strong>Ký số tại máy người dùng:</strong> Khóa riêng (private key) không bao giờ rời khỏi
              USB Token của bạn. Quá trình ký diễn ra hoàn toàn trên máy tính cá nhân thông qua
              phần mềm PDFSignPro Signer.
            </li>
            <li>
              <strong>Không lưu mã PIN:</strong> Mã PIN USB Token chỉ được cache cục bộ trên máy
              bạn (mã hóa DPAPI), không gửi lên server.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">4. Chia sẻ thông tin</h2>
          <p>
            Chúng tôi <strong>không bán, cho thuê hoặc chia sẻ</strong> thông tin cá nhân của bạn
            cho bên thứ ba, ngoại trừ:
          </p>
          <ul className="list-disc space-y-2 pl-6">
            <li>Khi được bạn đồng ý hoặc yêu cầu.</li>
            <li>Khi cần thiết để tuân thủ pháp luật hoặc yêu cầu từ cơ quan có thẩm quyền.</li>
            <li>
              Các nhà cung cấp hạ tầng (Cloudflare, Google OAuth) — chỉ ở mức cần thiết
              để vận hành dịch vụ.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">5. Liên kết chia sẻ tài liệu</h2>
          <p>
            Tài liệu đã ký có thể được chia sẻ qua liên kết công khai. Bất kỳ ai có liên kết
            đều có thể xem và tải tài liệu. Bạn chịu trách nhiệm quản lý việc chia sẻ liên kết
            tài liệu của mình.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">6. Cookie và phân tích</h2>
          <p>
            Chúng tôi sử dụng cookie phiên (session) để duy trì đăng nhập. Dịch vụ có thể tích hợp
            Google Analytics để thống kê lượt truy cập ẩn danh. Bạn có thể tắt cookie trong
            cài đặt trình duyệt.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">7. Quyền của bạn</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>Yêu cầu xem, chỉnh sửa hoặc xóa thông tin cá nhân.</li>
            <li>Yêu cầu xóa tài liệu đã tải lên.</li>
            <li>Rút lại quyền truy cập Google bất kỳ lúc nào.</li>
            <li>Ngừng sử dụng Dịch vụ và yêu cầu xóa tài khoản.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">8. Lưu trữ và xóa dữ liệu</h2>
          <p>
            Tài liệu được lưu trữ trong suốt thời gian bạn sử dụng Dịch vụ. Tài liệu không hoạt động
            trên tài khoản miễn phí có thể bị xóa sau 90 ngày. Khi xóa tài khoản, toàn bộ dữ liệu
            liên quan sẽ được xóa trong vòng 30 ngày.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">9. Thay đổi chính sách</h2>
          <p>
            Chúng tôi có thể cập nhật Chính sách bảo mật. Thay đổi quan trọng sẽ được thông báo
            trên trang web. Ngày cập nhật được ghi ở đầu trang.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">10. Liên hệ</h2>
          <p>
            Mọi thắc mắc về quyền riêng tư, vui lòng liên hệ:{" "}
            <a href="mailto:info@thietkeweb.dev" className="text-primary hover:underline">
              info@thietkeweb.dev
            </a>{" "}
            hoặc Zalo:{" "}
            <a
              href="https://zalo.me/0984056777"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              0984.056.777
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
