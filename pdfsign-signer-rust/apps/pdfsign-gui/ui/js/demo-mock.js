/**
 * Browser demo shim when Tauri APIs are absent (screenshots / UI review).
 * Loaded only when window.__TAURI__ is missing.
 */
(function () {
  if (window.__TAURI__) return;

  const DEMO_PDF = (() => {
    // Minimal valid-ish PDF bytes (one blank page) as base64
    const b64 =
      "JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAyIDAgUgovTWVkaWFCb3ggWzAgMCA1OTUgODQyXQovQ29udGVudHMgNCAwIFIKL1Jlc291cmNlcyA8PAovRm9udCA8PAovRjEgNSAwIFI+Pj4+Cj4+CmVuZG9iago0IDAgb2JqCjw8Ci9MZW5ndGggNDQKPj4Kc3RyZWFtCkJUCi9GMSAyNCBUZgo1MCA3ODAgVGQKKFBERlNpZ24gZGVtbykgVGoKRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8Ci9UeXBlIC9Gb250Ci9TdWJ0eXBlIC9UeXBlMQovQmFzZUZvbnQgL0hlbHZldGljYQo+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDE1IDAwMDAwIG4gCjAwMDAwMDAwNjQgMDAwMDAgbiAKMDAwMDAwMDEyMSAwMDAwMCBuIAowMDAwMDAwMjc0IDAwMDAwIG4gCjAwMDAwMDAzNjkgMDAwMDAgbiAKdHJhaWxlcgo8PAovU2l6ZSA2Ci9Sb290IDEgMCBSCj4+CnN0YXJ0eHJlZgo0NDYKJSVFT0YK";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  })();

  const settings = {
    level: "B-B",
    outputSuffix: "-da-ky",
    location: "Hà Nội",
    outputDir: "",
    tsaUrl: "http://timestamp.digicert.com",
    tsas: [
      { name: "DigiCert", url: "http://timestamp.digicert.com", enabled: true, verified: true },
      { name: "Sectigo", url: "http://timestamp.sectigo.com", enabled: true, verified: false },
    ],
    trustAnchors: [],
    lastModule: "/usr/lib/softhsm/libsofthsm2.so",
    lastSlot: 0,
    lastCertSerial: "01",
    templateId: "default",
  };

  const templates = [
    {
      id: "default",
      name: "Mặc định",
      lines: ["{cn}", "{org}", "{date}"],
      layout: "imageLeft",
      align: "left",
      accentColor: "#2563eb",
      textColor: "#111114",
      fontSize: null,
      dateFormat: "%d/%m/%Y %H:%M:%S",
      showBorder: true,
      showCheckIcon: true,
      sealImage: null,
      signatureImage: null,
    },
  ];

  function stampPdf(w = 220, h = 70) {
    // Return the demo PDF as a stand-in stamp preview
    return DEMO_PDF.slice();
  }

  const handlers = {
    get_settings: async () => structuredClone(settings),
    save_settings: async ({ settings: s }) => {
      Object.assign(settings, s);
    },
    config_path: async () => "%APPDATA%\\PDFSign",
    list_templates: async () => structuredClone(templates),
    save_template: async ({ template }) => {
      const t = { ...template, id: template.id || "tpl-" + Date.now() };
      const i = templates.findIndex((x) => x.id === t.id);
      if (i >= 0) templates[i] = t;
      else templates.push(t);
      return structuredClone(t);
    },
    delete_template: async ({ id }) => {
      const i = templates.findIndex((t) => t.id === id);
      if (i >= 0) templates.splice(i, 1);
    },
    set_template_image: async ({ id, slot, path }) => {
      const t = templates.find((x) => x.id === id);
      if (slot === "seal") t.sealImage = path;
      else t.signatureImage = path;
      return structuredClone(t);
    },
    template_preview: async () => stampPdf(),
    list_tokens: async () => [
      {
        path: "/usr/lib/softhsm/libsofthsm2.so",
        vendor: "SoftHSM",
        slots: [{ index: 0, label: "PDFSign SoftHSM", pinLocked: false, pinFinalTry: false }],
        error: null,
      },
    ],
    list_certs: async () => [
      {
        serial: "01",
        displayName: "Nguyễn Văn A · Công ty Demo",
        validTo: "2028-12-31",
        validNow: true,
        isCa: false,
      },
    ],
    page_count: async () => 2,
    read_pdf: async () => DEMO_PDF.slice(),
    sign_job: async () => {
      await new Promise((r) => setTimeout(r, 600));
      return [
        {
          ok: true,
          input: "C:/Docs/hop-dong.pdf",
          output: "C:/Docs/hop-dong-da-ky.pdf",
          level: "B-T",
          signatures: 1,
          warnings: [],
        },
      ];
    },
    verify: async () => {
      const q = new URLSearchParams(location.search).get("verify");
      if (q === "invalid") {
        return [
          {
            kind: "signature",
            field: "Signature1",
            signer: "Nguyễn Văn A",
            signerCn: "Nguyễn Văn A",
            issuer: "Demo CA",
            claimedTime: new Date().toISOString(),
            timestampTime: null,
            timestampOk: false,
            integrity: false,
            coversWholeFile: true,
            chain: ["Nguyễn Văn A", "Demo CA"],
            trusted: false,
            certValidAtSigning: true,
            ltv: false,
            revocation: [],
            subFilter: "ETSI.CAdES.detached",
            level: "B-B",
            verdict: "invalid",
            notes: ["Nội dung PDF đã bị thay đổi sau khi ký."],
          },
        ];
      }
      return [
        {
          kind: "signature",
          field: "Signature1",
          signer: "Nguyễn Văn A",
          signerCn: "Nguyễn Văn A",
          issuer: "Demo CA",
          claimedTime: new Date().toISOString(),
          timestampTime: new Date().toISOString(),
          timestampOk: true,
          integrity: true,
          coversWholeFile: true,
          chain: ["Nguyễn Văn A", "Demo CA"],
          trusted: true,
          certValidAtSigning: true,
          ltv: true,
          revocation: [{ subject: "Nguyễn Văn A", status: "good", source: "OCSP" }],
          subFilter: "ETSI.CAdES.detached",
          level: "B-LT",
          verdict: "valid",
          notes: [],
        },
      ];
    },
    test_tsa: async () => "OK",
  };

  const listeners = {};
  window.__TAURI__ = {
    core: {
      invoke: async (cmd, args = {}) => {
        if (!handlers[cmd]) throw { message: `demo: missing ${cmd}` };
        return handlers[cmd](args);
      },
    },
    event: {
      listen: async (name, cb) => {
        listeners[name] = cb;
        return () => delete listeners[name];
      },
    },
    dialog: {
      open: async (opts) => {
        if (opts?.directory) return "C:/Docs/out";
        if (opts?.multiple) return ["C:/Docs/hop-dong.pdf", "C:/Docs/phu-luc.pdf"];
        if (String(opts?.filters?.[0]?.name || "").includes("PKCS")) return "/usr/lib/softhsm/libsofthsm2.so";
        if (String(opts?.filters?.[0]?.name || "").includes("Ảnh")) return null;
        if (String(opts?.filters?.[0]?.name || "").includes("Chứng")) return null;
        return "C:/Docs/hop-dong-da-ky.pdf";
      },
    },
    opener: {
      openPath: async () => {},
      revealItemInDir: async () => {},
    },
  };

  window.__pdfsignDemo = {
    emitProgress: (done, total, current) => {
      listeners["sign-progress"]?.({ payload: { done, total, current } });
    },
    setScene: async (scene) => {
      const show = window.__pdfsignShowView;
      const sign = window.__pdfsignSign;
      if (scene === "empty") {
        show?.("sign");
        document.getElementById("clear-files")?.click();
        sign?.setSignStep?.(1);
        return;
      }
      if (
        scene === "files" ||
        scene === "box" ||
        scene === "token" ||
        scene === "pin" ||
        scene === "progress" ||
        scene === "results"
      ) {
        show?.("sign");
        await sign?.addFiles?.(["C:/Docs/hop-dong.pdf"]);
        await sign?.scanTokens?.().catch(() => {});
        const v = sign?.getViewer?.();
        const needBox = scene === "box" || scene === "token" || scene === "pin" || scene === "progress" || scene === "results";
        if (v && needBox) {
          const page = v.numPages || v.pageNum || 1;
          // Place box mid-page so it stays obvious on the preview in every step.
          v.boxes = [{ id: 1, page, x: 0.52, y: 0.42, w: 0.4, h: 0.12 }];
          v.selected = 1;
          await v.goto(page);
          // Wait a frame so overlay exists after render, then paint boxes.
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          v.drawBoxes();
          v.onChange?.(v.boxes);
        }
        if (scene === "files") sign?.setSignStep?.(1);
        if (scene === "box") sign?.setSignStep?.(2);
        if (scene === "token") sign?.setSignStep?.(3);
        if (scene === "pin" || scene === "progress" || scene === "results") sign?.setSignStep?.(4);
        // Always re-paint after step scroll/token refresh.
        await new Promise((r) => requestAnimationFrame(r));
        sign?.redrawBoxes?.();
        if (scene === "pin") sign?.openPinModal?.();
        if (scene === "progress") {
          document.getElementById("progress").hidden = false;
          document.getElementById("progress").querySelector(".bar").style.width = "45%";
          document.getElementById("progress").querySelector("span").textContent = "Đang ký 1/2: hop-dong.pdf";
          document.getElementById("sign-status").textContent = "Đang ký…";
        }
        if (scene === "results") {
          await sign?.doSign?.("1234");
        }
        return;
      }
      if (scene === "verify-valid" || scene === "verify-invalid") {
        const url = new URL(location.href);
        url.searchParams.set("verify", scene === "verify-invalid" ? "invalid" : "valid");
        history.replaceState(null, "", url);
        show?.("verify");
        const { verifyPath } = await import("./verify.js");
        await verifyPath("C:/Docs/hop-dong-da-ky.pdf");
        return;
      }
      if (scene === "templates") {
        show?.("templates");
        return;
      }
      if (scene === "settings") {
        show?.("settings");
        return;
      }
    },
  };
})();
