import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    _resend = new Resend(key);
  }
  return _resend;
}

const EMAIL_FROM = process.env.EMAIL_FROM || "PDFSignPro <noreply@pdfsign.vn>";

export async function sendSigningInvitation(
  to: string,
  signerName: string,
  contractTitle: string,
  signingUrl: string,
  ownerName?: string
) {
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:'Segoe UI',Roboto,sans-serif;background:#f9fafb;padding:40px 0">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <div style="background:linear-gradient(135deg,#2563eb,#7c3aed);padding:32px 40px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:22px">📝 Yêu cầu ký hợp đồng</h1>
    </div>
    <div style="padding:32px 40px">
      <p style="color:#374151;font-size:16px;line-height:1.6">
        Xin chào <strong>${signerName}</strong>,
      </p>
      <p style="color:#374151;font-size:16px;line-height:1.6">
        ${ownerName ? `<strong>${ownerName}</strong> đã` : "Bạn được"} mời ký hợp đồng:
      </p>
      <div style="background:#f3f4f6;border-radius:8px;padding:16px 20px;margin:20px 0">
        <p style="color:#111827;font-size:18px;font-weight:600;margin:0">${contractTitle}</p>
      </div>
      <p style="color:#6b7280;font-size:14px;line-height:1.6">
        Vui lòng nhấn nút bên dưới để xem và ký hợp đồng bằng USB Token chữ ký số.
      </p>
      <div style="text-align:center;margin:32px 0">
        <a href="${signingUrl}" style="display:inline-block;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;text-decoration:none;padding:14px 40px;border-radius:8px;font-size:16px;font-weight:600">
          Xem & Ký hợp đồng
        </a>
      </div>
      <p style="color:#9ca3af;font-size:13px;line-height:1.5;border-top:1px solid #e5e7eb;padding-top:20px">
        Nếu bạn không mong đợi email này, vui lòng bỏ qua. Link ký chỉ dành cho bạn.
      </p>
    </div>
  </div>
</body>
</html>`;

  await getResend().emails.send({
    from: EMAIL_FROM,
    to,
    subject: `Yêu cầu ký hợp đồng: ${contractTitle}`,
    html,
  });
}

export async function sendContractCompleted(
  to: string,
  recipientName: string,
  contractTitle: string,
  viewUrl: string
) {
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:'Segoe UI',Roboto,sans-serif;background:#f9fafb;padding:40px 0">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <div style="background:linear-gradient(135deg,#059669,#10b981);padding:32px 40px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:22px">✅ Hợp đồng đã hoàn tất</h1>
    </div>
    <div style="padding:32px 40px">
      <p style="color:#374151;font-size:16px;line-height:1.6">
        Xin chào <strong>${recipientName}</strong>,
      </p>
      <p style="color:#374151;font-size:16px;line-height:1.6">
        Tất cả các bên đã ký thành công hợp đồng:
      </p>
      <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:16px 20px;margin:20px 0">
        <p style="color:#065f46;font-size:18px;font-weight:600;margin:0">${contractTitle}</p>
      </div>
      <p style="color:#6b7280;font-size:14px;line-height:1.6">
        Bạn có thể xem và tải xuống tài liệu đã ký bên dưới.
      </p>
      <div style="text-align:center;margin:32px 0">
        <a href="${viewUrl}" style="display:inline-block;background:linear-gradient(135deg,#059669,#10b981);color:#fff;text-decoration:none;padding:14px 40px;border-radius:8px;font-size:16px;font-weight:600">
          Xem hợp đồng đã ký
        </a>
      </div>
    </div>
  </div>
</body>
</html>`;

  await getResend().emails.send({
    from: EMAIL_FROM,
    to,
    subject: `Hợp đồng đã hoàn tất: ${contractTitle}`,
    html,
  });
}
