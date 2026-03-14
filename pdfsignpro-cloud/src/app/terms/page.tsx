import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Điều khoản dịch vụ",
  description: "Điều khoản sử dụng dịch vụ ký số PDF trực tuyến PDFSignPro Cloud.",
};

export default function TermsPage() {
  return (
    <div className="container mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <h1 className="mb-8 text-3xl font-bold tracking-tight sm:text-4xl">
        Điều khoản dịch vụ
      </h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Cập nhật lần cuối: 15/03/2025
      </p>

      <div className="prose prose-zinc dark:prose-invert max-w-none space-y-8 text-[15px] leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold">1. Giới thiệu</h2>
          <p>
            PDFSignPro Cloud (&quot;Dịch vụ&quot;) là nền tảng ký số PDF trực tuyến do PDFSignPro cung cấp.
            Bằng việc truy cập và sử dụng Dịch vụ, bạn đồng ý tuân thủ các điều khoản dưới đây.
            Nếu không đồng ý, vui lòng ngừng sử dụng Dịch vụ.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">2. Phạm vi dịch vụ</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>Tải lên tài liệu PDF để ký số bằng USB Token (chữ ký số PKCS#11).</li>
            <li>Đặt vị trí chữ ký trên tài liệu, chọn mẫu chữ ký.</li>
            <li>Ký số chuẩn PAdES thông qua phần mềm PDFSignPro Signer trên Windows.</li>
            <li>Lưu trữ và chia sẻ tài liệu đã ký qua liên kết công khai.</li>
            <li>Quản lý tài liệu cá nhân thông qua tài khoản đăng nhập (Google).</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">3. Tài khoản người dùng</h2>
          <p>
            Bạn có thể sử dụng Dịch vụ mà không cần đăng ký tài khoản. Khi đăng nhập bằng Google,
            tài liệu tải lên sẽ được gắn với tài khoản của bạn để quản lý. Bạn chịu trách nhiệm
            bảo mật tài khoản và mọi hoạt động diễn ra dưới tài khoản của mình.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">4. Quyền sở hữu tài liệu</h2>
          <p>
            Bạn giữ toàn quyền sở hữu đối với tài liệu tải lên. PDFSignPro không yêu cầu quyền
            sở hữu trí tuệ đối với nội dung của bạn. Chúng tôi chỉ xử lý tài liệu để cung cấp
            dịch vụ ký số.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">5. Hạn chế sử dụng</h2>
          <p>Bạn cam kết không sử dụng Dịch vụ để:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>Tải lên nội dung vi phạm pháp luật Việt Nam hoặc pháp luật quốc tế.</li>
            <li>Giả mạo chữ ký số hoặc sử dụng chứng thư số không thuộc quyền sở hữu của bạn.</li>
            <li>Gây ảnh hưởng đến hoạt động bình thường của hệ thống (tấn công, spam, khai thác lỗ hổng).</li>
            <li>Sử dụng cho mục đích lừa đảo, gian lận hoặc các hoạt động bất hợp pháp khác.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">6. Giới hạn trách nhiệm</h2>
          <p>
            PDFSignPro cung cấp Dịch vụ trên cơ sở &quot;nguyên trạng&quot; (as-is). Chúng tôi nỗ lực
            đảm bảo tính sẵn sàng và bảo mật, nhưng không đảm bảo Dịch vụ hoạt động liên tục
            không gián đoạn. PDFSignPro không chịu trách nhiệm đối với:
          </p>
          <ul className="list-disc space-y-2 pl-6">
            <li>Thiệt hại phát sinh từ việc sử dụng hoặc không thể sử dụng Dịch vụ.</li>
            <li>Mất mát dữ liệu do nguyên nhân ngoài tầm kiểm soát.</li>
            <li>Tính hợp lệ pháp lý của chữ ký số — điều này phụ thuộc vào chứng thư số và
              nhà cung cấp CA của bạn.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">7. Lưu trữ dữ liệu</h2>
          <p>
            Tài liệu tải lên được lưu trữ trên hạ tầng cloud bảo mật (Cloudflare R2).
            Chúng tôi có thể xóa tài liệu không hoạt động sau 90 ngày đối với tài khoản miễn phí.
            Bạn nên tải về và lưu trữ bản sao tài liệu đã ký.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">8. Chấm dứt dịch vụ</h2>
          <p>
            Chúng tôi có quyền tạm ngừng hoặc chấm dứt quyền truy cập của bạn nếu vi phạm
            Điều khoản dịch vụ. Bạn có thể ngừng sử dụng Dịch vụ bất kỳ lúc nào.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">9. Thay đổi điều khoản</h2>
          <p>
            PDFSignPro có quyền cập nhật Điều khoản dịch vụ. Thay đổi quan trọng sẽ được thông báo
            trên trang web. Việc tiếp tục sử dụng Dịch vụ sau thay đổi đồng nghĩa với việc bạn
            chấp nhận điều khoản mới.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">10. Liên hệ</h2>
          <p>
            Mọi thắc mắc về Điều khoản dịch vụ, vui lòng liên hệ:{" "}
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
