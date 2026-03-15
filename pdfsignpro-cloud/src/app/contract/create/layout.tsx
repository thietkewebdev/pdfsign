import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tạo hợp đồng điện tử | PDFSignPro Cloud",
  description: "Tạo hợp đồng điện tử nhiều bên, gửi ký theo thứ tự với email thông báo tự động.",
};

export default function CreateContractLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
