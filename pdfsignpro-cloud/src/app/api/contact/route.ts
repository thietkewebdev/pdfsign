import { NextResponse } from "next/server";

const TOPICS = ["bug", "demo", "payment", "other"] as const;

const TOPIC_LABELS: Record<string, string> = {
  bug: "Báo lỗi",
  demo: "Tư vấn / Demo",
  payment: "Thanh toán",
  other: "Khác",
};

async function sendTelegramNotification(params: {
  name: string;
  contact: string;
  topic: string;
  message: string;
}) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return;

  const topicLabel = TOPIC_LABELS[params.topic] ?? params.topic;
  const text = [
    "📩 Liên hệ mới - PDFSignPro",
    "",
    `👤 Họ tên: ${params.name}`,
    `📧 Email/SĐT: ${params.contact}`,
    `📌 Chủ đề: ${topicLabel}`,
    "",
    "💬 Nội dung:",
    params.message,
  ].join("\n");

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Telegram sendMessage failed:", res.status, err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const contact = typeof body.contact === "string" ? body.contact.trim() : "";
    const topic = body.topic;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const consent = body.consent === true;

    if (!name || name.length < 2) {
      return NextResponse.json(
        { error: "Vui lòng nhập họ tên (ít nhất 2 ký tự)." },
        { status: 400 }
      );
    }

    if (!contact || contact.length < 5) {
      return NextResponse.json(
        { error: "Vui lòng nhập email hoặc số điện thoại hợp lệ." },
        { status: 400 }
      );
    }

    if (!TOPICS.includes(topic)) {
      return NextResponse.json(
        { error: "Vui lòng chọn chủ đề." },
        { status: 400 }
      );
    }

    if (!message || message.length < 10) {
      return NextResponse.json(
        { error: "Vui lòng nhập nội dung (ít nhất 10 ký tự)." },
        { status: 400 }
      );
    }

    if (!consent) {
      return NextResponse.json(
        { error: "Vui lòng đồng ý chia sẻ thông tin để được hỗ trợ." },
        { status: 400 }
      );
    }

    console.log("[Contact]", { name, contact, topic, messageLength: message.length });

    await sendTelegramNotification({ name, contact, topic, message });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/contact error:", err);
    return NextResponse.json(
      { error: "Lỗi xử lý. Vui lòng thử lại." },
      { status: 500 }
    );
  }
}
