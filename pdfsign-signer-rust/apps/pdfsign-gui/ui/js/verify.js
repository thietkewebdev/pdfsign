import { $, invoke, dialog, errText, fileName } from "./api.js";

const VERDICT = {
  valid: "Hợp lệ",
  warning: "Cần lưu ý",
  invalid: "Không hợp lệ",
};

function fmtTime(iso) {
  if (!iso) return "—";
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

function card(v, open) {
  const el = document.createElement("div");
  el.className = "card" + (open ? " open" : "");
  const head = document.createElement("div");
  head.className = "card-head";
  const title = document.createElement("h3");
  title.textContent = v.kind === "docTimeStamp" ? `${v.field} (dấu thời gian)` : `${v.field}: ${v.signer || "?"}`;
  const badge = document.createElement("span");
  badge.className = `badge ${v.verdict}`;
  badge.textContent = VERDICT[v.verdict] || v.verdict;
  const level = document.createElement("span");
  level.className = "badge level";
  level.textContent = v.level === "CMS" ? "PKCS#7" : v.level;
  const chev = document.createElement("span");
  chev.className = "chev";
  chev.textContent = "▾";
  head.append(title, badge, level, chev);
  head.onclick = () => el.classList.toggle("open");

  const body = document.createElement("div");
  body.className = "card-body";
  if (v.kind !== "docTimeStamp") {
    body.append(kv("Người ký", v.signerCn || "—"));
    body.append(kv("CA cấp", v.issuer || "—"));
    body.append(kv("Thời điểm ký", fmtTime(v.claimedTime)));
  }
  body.append(
    kv("Dấu thời gian", v.timestampTime ? `${fmtTime(v.timestampTime)} (${v.timestampOk ? "OK" : "lỗi"})` : "Không có"),
  );
  body.append(kv("Toàn vẹn", v.integrity ? "Nguyên vẹn" : "ĐÃ BỊ THAY ĐỔI"));
  body.append(kv("Phủ toàn bộ", v.coversWholeFile ? "Có" : "Không"));
  body.append(kv("Chuỗi CT", v.chain.join(" → ") || "—"));
  body.append(kv("Tin cậy CA", yesNo(v.trusted)));
  body.append(kv("Hiệu lực lúc ký", v.certValidAtSigning ? "Còn hiệu lực" : "Hết hiệu lực"));
  body.append(kv("LTV", v.ltv ? "Đầy đủ" : "Chưa đủ"));
  if (v.revocation.length) {
    body.append(
      kv(
        "Thu hồi",
        v.revocation
          .map((r) => `${r.subject}: ${r.status === "good" ? "tốt" : r.status === "revoked" ? "thu hồi" : "không rõ"}`)
          .join("; "),
      ),
    );
  }
  body.append(kv("SubFilter", v.subFilter));
  if (v.notes?.length) {
    const notes = document.createElement("ul");
    notes.className = "notes";
    for (const n of v.notes) {
      const li = document.createElement("li");
      li.textContent = n;
      notes.append(li);
    }
    body.append(notes);
  }
  el.append(head, body);
  return el;
}

function showLoaded() {
  $("verify-drop").hidden = true;
  $("verify-toolbar").style.display = "flex";
}

export async function verifyPath(path) {
  showLoaded();
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
    const worst = views.some((v) => v.verdict === "invalid")
      ? "invalid"
      : views.some((v) => v.verdict === "warning")
        ? "warning"
        : "valid";
    summary.hidden = false;
    summary.className = `summary ${worst}`;
    summary.textContent = `${sigs.length} chữ ký · ${views.length - sigs.length} dấu thời gian · ${VERDICT[worst]}`;
    views.forEach((v, i) => $("verify-list").append(card(v, i === 0)));
  } catch (e) {
    $("verify-list").innerHTML = "";
    summary.hidden = false;
    summary.className = "summary invalid";
    summary.textContent = `Không đọc được file: ${errText(e)}`;
  }
}

async function pickVerify() {
  const p = await dialog.open({ multiple: false, filters: [{ name: "PDF", extensions: ["pdf"] }] });
  if (p) await verifyPath(p);
}

export function initVerify() {
  $("verify-open").onclick = () => pickVerify().catch((e) => ($("verify-summary").textContent = errText(e)));
  const drop = $("verify-drop");
  drop.addEventListener("click", () => pickVerify());
  drop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pickVerify();
    }
  });
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("dragover");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("dragover");
    pickVerify();
  });
  try {
    const webview = window.__TAURI__?.webview?.getCurrentWebview?.();
    webview?.onDragDropEvent?.((event) => {
      if (!document.getElementById("view-verify")?.classList.contains("active")) return;
      const payload = event.payload;
      if (payload?.type === "drop" && payload.paths?.length) verifyPath(payload.paths[0]);
    });
  } catch (_) {
    /* ignore */
  }
}
