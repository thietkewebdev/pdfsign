import { $, invoke, dialog, errText, fileName } from "./api.js";

const VERDICT = {
  valid: "Hợp lệ",
  warning: "Hợp lệ, cần lưu ý",
  invalid: "Không hợp lệ",
};

function fmtTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

function kv(label, value) {
  const div = document.createElement("div");
  div.className = "kv";
  const b = document.createElement("b");
  b.textContent = label;
  const s = document.createElement("span");
  s.textContent = value;
  div.append(b, s);
  return div;
}

function yesNo(v) {
  return v === true ? "Có" : v === false ? "Không" : "Chưa kiểm tra";
}

function card(v) {
  const el = document.createElement("div");
  el.className = "card";
  const h = document.createElement("h3");
  const title = document.createElement("span");
  title.textContent = v.kind === "docTimeStamp" ? `${v.field} (dấu thời gian tài liệu)` : `${v.field}: ${v.signer || "?"}`;
  const badge = document.createElement("span");
  badge.className = `badge ${v.verdict}`;
  badge.textContent = VERDICT[v.verdict] || v.verdict;
  const level = document.createElement("span");
  level.className = "badge level";
  level.textContent = v.level === "CMS" ? "PKCS#7 (không phải PAdES)" : v.level;
  h.append(title, badge, level);
  el.append(h);
  if (v.kind !== "docTimeStamp") {
    el.append(kv("Người ký (CN)", v.signerCn || "-"));
    el.append(kv("CA cấp", v.issuer || "-"));
    el.append(kv("Thời điểm ký (khai báo)", fmtTime(v.claimedTime)));
  }
  el.append(kv("Dấu thời gian TSA", v.timestampTime ? `${fmtTime(v.timestampTime)} (${v.timestampOk ? "hợp lệ" : "KHÔNG hợp lệ"})` : "Không có"));
  el.append(kv("Toàn vẹn tài liệu", v.integrity ? "Nguyên vẹn" : "ĐÃ BỊ THAY ĐỔI"));
  el.append(kv("Phủ toàn bộ file", v.coversWholeFile ? "Có" : "Không (có cập nhật sau)"));
  el.append(kv("Chuỗi chứng thư", v.chain.join(" → ") || "-"));
  el.append(kv("Tin cậy CA gốc", yesNo(v.trusted)));
  el.append(kv("Hiệu lực lúc ký", v.certValidAtSigning ? "Còn hiệu lực" : "Hết hiệu lực"));
  el.append(kv("LTV (OCSP/CRL nhúng)", v.ltv ? "Đầy đủ" : "Chưa đủ"));
  if (v.revocation.length) {
    el.append(
      kv(
        "Thu hồi",
        v.revocation.map((r) => `${r.subject}: ${r.status === "good" ? "tốt" : r.status === "revoked" ? "BỊ THU HỒI" : "không rõ"} (${r.source})`).join("; "),
      ),
    );
  }
  el.append(kv("SubFilter", v.subFilter));
  const notes = document.createElement("ul");
  notes.className = "notes";
  for (const n of v.notes) {
    const li = document.createElement("li");
    li.textContent = n;
    notes.append(li);
  }
  el.append(notes);
  return el;
}

export async function verifyPath(path) {
  $("verify-file").textContent = fileName(path);
  $("verify-list").innerHTML = '<p class="muted">Đang kiểm tra…</p>';
  const summary = $("verify-summary");
  summary.hidden = true;
  try {
    const views = await invoke("verify", { path });
    $("verify-list").innerHTML = "";
    if (!views.length) {
      summary.hidden = false;
      summary.className = "summary warning";
      summary.textContent = "File không có chữ ký số.";
      return;
    }
    const sigs = views.filter((v) => v.kind === "signature");
    const worst = views.some((v) => v.verdict === "invalid") ? "invalid" : views.some((v) => v.verdict === "warning") ? "warning" : "valid";
    summary.hidden = false;
    summary.className = `summary ${worst}`;
    summary.textContent = `${sigs.length} chữ ký, ${views.length - sigs.length} dấu thời gian tài liệu · ${VERDICT[worst]}`;
    for (const v of views) $("verify-list").append(card(v));
  } catch (e) {
    $("verify-list").innerHTML = "";
    summary.hidden = false;
    summary.className = "summary invalid";
    summary.textContent = `Không đọc được file: ${errText(e)}`;
  }
}

export function initVerify() {
  $("verify-open").onclick = async () => {
    const p = await dialog.open({ multiple: false, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (p) await verifyPath(p);
  };
}
