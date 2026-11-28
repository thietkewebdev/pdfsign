// Compact web-sign window: opened by pdfsign:// deep links. Token + cert are picked
// automatically (last used, else the only valid one); the user only types the PIN.

import { $, invoke, listen, opener } from "./api.js";

/** Codes after which the deep link cannot be reused: the user must click Ký again on the web. */
const DEAD_LINK = ["LAUNCH_USED", "LAUNCH_EXPIRED", "JOB_EXPIRED", "INVALID_TOKEN"];

let deepLink = null;
let settings = null;
/** @type {{module: string, slot: number, cert: any, token: any}[]} */
let candidates = [];
let busy = false;
let done = false;

function errMessage(e) {
  if (!e) return "Đã xảy ra lỗi. Vui lòng thử lại.";
  if (typeof e === "string") return e;
  const code = e.code || "";
  if (DEAD_LINK.includes(code)) {
    return "Lệnh ký đã hết hạn hoặc đã được dùng. Hãy bấm Ký lại trên trình duyệt.";
  }
  if (code === "FILE_TOO_LARGE") return "File quá lớn để ký.";
  if (code === "RATE_LIMITED") return "Quá nhiều yêu cầu, thử lại sau ít phút.";
  return e.message || "Đã xảy ra lỗi. Vui lòng thử lại.";
}

function showMsg(text, kind = "err") {
  const el = $("q-msg");
  el.textContent = text;
  el.className = `q-msg ${kind}`;
  el.hidden = !text;
}

function selected() {
  if (candidates.length === 1) return candidates[0];
  const i = Number($("q-cert").value);
  return Number.isInteger(i) ? candidates[i] : undefined;
}

function pinWarning(c) {
  if (!c) return "";
  if (c.token.pinLocked) return "Token đã bị khóa PIN. Dùng phần mềm của nhà cung cấp để mở khóa.";
  if (c.token.pinFinalTry) return "Token chỉ còn 1 lần nhập PIN. Dừng lại và kiểm tra PIN trước khi ký.";
  if (c.token.pinCountLow) return "Token đã có lần nhập sai PIN. Kiểm tra kỹ trước khi ký.";
  return "";
}

function refreshState() {
  const c = selected();
  const pin = $("q-pin").value;
  $("q-sign").disabled = busy || !deepLink || !c || !pin || c.token.pinLocked;
  $("q-sub").textContent = done
    ? "Hoàn tất"
    : deepLink
      ? "Nhập mã PIN để ký tài liệu"
      : "Đang chờ lệnh ký từ trình duyệt…";
}

function certLabel(c) {
  return c.cert.displayName || c.cert.subjectCn || c.cert.serial;
}

function renderCandidates() {
  $("q-cert-one").hidden = candidates.length !== 1;
  $("q-cert-many").hidden = candidates.length < 2;
  $("q-notoken").hidden = candidates.length !== 0;
  $("q-pin-wrap").hidden = candidates.length === 0;
  if (candidates.length === 1) {
    const c = candidates[0];
    $("q-cert-name").textContent = certLabel(c);
    $("q-cert-meta").textContent =
      `${c.cert.issuerCn || ""} · hết hạn ${c.cert.validTo}`;
  } else if (candidates.length > 1) {
    const sel = $("q-cert");
    sel.innerHTML = "";
    candidates.forEach((c, i) => {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = `${certLabel(c)} · ${c.cert.issuerCn || ""} · hết hạn ${c.cert.validTo}`;
      sel.append(o);
    });
    const last = candidates.findIndex(
      (c) =>
        c.module === settings?.lastModule &&
        c.slot === settings?.lastSlot &&
        c.cert.serial === settings?.lastCertSerial,
    );
    sel.value = String(last >= 0 ? last : 0);
  }
  const warn = pinWarning(selected());
  showMsg(warn, "err");
  refreshState();
}

async function scan() {
  $("q-rescan").disabled = true;
  showMsg("Đang dò token…", "info");
  try {
    const modules = await invoke("list_tokens", { extraModule: null });
    const found = [];
    for (const m of modules) {
      for (const token of m.slots || []) {
        try {
          const certs = await invoke("list_certs", { module: m.path, slot: token.index });
          for (const cert of certs) {
            if (!cert.isCa && cert.validNow) found.push({ module: m.path, slot: token.index, cert, token });
          }
        } catch (e) {
          console.warn("list_certs", m.path, e);
        }
      }
    }
    // Several driver DLLs can expose the same physical token: keep one entry per cert serial,
    // preferring the module used last time.
    found.sort((a, b) => (b.module === settings?.lastModule) - (a.module === settings?.lastModule));
    const seen = new Set();
    candidates = found.filter((c) => !seen.has(c.cert.serial) && seen.add(c.cert.serial));
    showMsg("");
  } catch (e) {
    candidates = [];
    showMsg(errMessage(e));
  } finally {
    $("q-rescan").disabled = false;
    renderCandidates();
  }
}

async function sign() {
  const c = selected();
  const pin = $("q-pin").value;
  if (!deepLink || !c || !pin || busy) return;
  busy = true;
  $("q-pin").value = "";
  $("q-sign").textContent = "Đang ký…";
  showMsg("");
  refreshState();
  try {
    await invoke("web_sign", {
      req: {
        deepLink,
        templateId: settings?.templateId || "default",
        module: c.module,
        slot: c.slot,
        certSerial: c.cert.serial,
        pin,
        level: null,
        tsaUrl: null,
      },
    });
    deepLink = null;
    done = true;
    $("q-form").hidden = true;
    $("q-done").hidden = false;
    setTimeout(() => window.__TAURI__.window.getCurrentWindow().close(), 2500);
  } catch (e) {
    if (DEAD_LINK.includes(e?.code)) deepLink = null;
    showMsg(errMessage(e));
    $("q-pin").focus();
  } finally {
    busy = false;
    $("q-sign").textContent = "Ký";
    refreshState();
  }
}

function acceptLink(url) {
  const u = String(url || "").trim();
  if (!u.toLowerCase().startsWith("pdfsign://")) return;
  deepLink = u;
  done = false;
  $("q-form").hidden = false;
  $("q-done").hidden = true;
  if (!busy) showMsg(pinWarning(selected()), "err");
  refreshState();
  $("q-pin").focus();
}

async function boot() {
  $("q-pin").addEventListener("input", refreshState);
  $("q-pin").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sign();
  });
  $("q-cert").addEventListener("change", () => {
    showMsg(pinWarning(selected()), "err");
    refreshState();
  });
  $("q-sign").onclick = sign;
  $("q-rescan").onclick = scan;
  $("q-full").onclick = () => invoke("open_main_window");
  $("q-log").onclick = async () => {
    const path = await invoke("support_log_file");
    opener.openPath(path);
  };

  await listen("deep-link", (ev) => acceptLink(ev.payload));
  try {
    acceptLink(await invoke("take_pending_deep_link"));
  } catch (e) {
    console.warn("take_pending_deep_link", e);
  }
  settings = await invoke("get_settings");
  await scan();
  $("q-pin").focus();
}

boot().catch((e) => showMsg(`Lỗi khởi động: ${errMessage(e)}`));
