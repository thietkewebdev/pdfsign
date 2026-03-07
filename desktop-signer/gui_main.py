#!/usr/bin/env python3
"""
PDFSignPro Signer - PySide6 GUI (Linear dark theme).

Entry point for deep link: pdfsignpro://sign?p=<base64url(JSON)>
CLI (--in/--out) delegates to sign_pades.py.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import requests
from PySide6.QtCore import QThread, Signal, Qt
from PySide6.QtWidgets import (
    QApplication,
    QMainWindow,
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QLineEdit,
    QComboBox,
    QTextEdit,
    QProgressBar,
    QStackedWidget,
    QFrame,
    QMessageBox,
    QScrollArea,
)
from PySide6.QtGui import QFont, QPalette, QColor

sys.path.insert(0, str(Path(__file__).resolve().parent))

from signer.pkcs11_discovery import get_pkcs11_dll
from signer.cert_selector import list_certs_from_token, CertInfo, get_signer_name
from signer.pades_signer import sign_pdf_sync

# Linear dark palette (zinc-950 bg, zinc-900 cards)
LINEAR_DARK = """
    QWidget { background-color: #0a0a0a; color: #fafafa; }
    QMainWindow { background-color: #0a0a0a; }
    QFrame#card { background-color: #18181b; border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; }
    QLabel { color: #fafafa; }
    QLabel#muted { color: #71717a; }
    QLineEdit, QComboBox { 
        background-color: #27272a; 
        color: #fafafa; 
        border: 1px solid rgba(255,255,255,0.08); 
        border-radius: 6px; 
        padding: 8px 12px;
        min-height: 20px;
    }
    QLineEdit:focus, QComboBox:focus { border-color: rgba(59,130,246,0.5); }
    QComboBox::drop-down { border: none; }
    QComboBox QAbstractItemView { background-color: #27272a; }
    QPushButton { 
        background-color: #27272a; 
        color: #fafafa; 
        border: 1px solid rgba(255,255,255,0.08); 
        border-radius: 6px; 
        padding: 10px 16px;
        min-height: 24px;
    }
    QPushButton:hover { background-color: #3f3f46; }
    QPushButton:disabled { opacity: 0.5; }
    QPushButton#primary { 
        background-color: #3b82f6; 
        border-color: #3b82f6;
        color: white;
    }
    QPushButton#primary:hover { background-color: #2563eb; }
    QProgressBar { 
        background-color: #27272a; 
        border: none; 
        border-radius: 4px;
        text-align: center;
    }
    QProgressBar::chunk { background-color: #3b82f6; border-radius: 4px; }
    QTextEdit { 
        background-color: #18181b; 
        color: #a1a1aa; 
        border: 1px solid rgba(255,255,255,0.06); 
        border-radius: 6px;
        padding: 8px;
        font-family: 'Cascadia Code', 'Consolas', monospace;
        font-size: 12px;
    }
"""


def _parse_deep_link(url: str) -> dict | None:
    """Parse pdfsignpro://sign?p=<payload>. Base64url-decode payload, parse JSON {j,c,h}.
    Then: POST https://{h}/api/jobs/{j}/claim with {code:c}."""
    if not url or not url.strip().lower().startswith("pdfsignpro://"):
        return None
    parsed = urlparse(url)
    if parsed.scheme.lower() != "pdfsignpro" or parsed.netloc.lower() != "sign":
        return None
    qs = parse_qs(parsed.query)
    p_b64 = (qs.get("p") or [None])[0]
    if p_b64:
        try:
            import base64
            import json
            pad = 4 - len(p_b64) % 4
            if pad != 4:
                p_b64 += "=" * pad
            raw = base64.urlsafe_b64decode(p_b64)
            data = json.loads(raw.decode("utf-8"))
            j = data.get("j")
            c = data.get("c")
            h = data.get("h")
            if j and c and h:
                scheme = "http" if h == "localhost" or str(h).startswith("localhost:") else "https"
                port = ":3000" if h == "localhost" else ""
                api_base = f"{scheme}://{h}{port}".rstrip("/")
                return {"jobId": j, "code": c, "apiBaseUrl": api_base}
        except (ValueError, json.JSONDecodeError, KeyError):
            pass
    # Legacy: jobId, code, u
    job_id = (qs.get("jobId") or qs.get("jobid") or [None])[0]
    code = (qs.get("code") or [None])[0]
    host = (qs.get("u") or [None])[0]
    if job_id and code and host:
        scheme = "http" if host == "localhost" or host.startswith("localhost:") else "https"
        port = ":3000" if host == "localhost" else ""
        api_base = f"{scheme}://{host}{port}".rstrip("/")
        return {"jobId": job_id, "code": code, "apiBaseUrl": api_base}
    return None


def _fetch_job(api_base: str, job_id: str, token: str) -> dict:
    """GET /api/jobs/[jobId] with x-job-token header."""
    url = f"{api_base}/api/jobs/{job_id}"
    r = requests.get(url, headers={"x-job-token": token}, timeout=30)
    r.raise_for_status()
    return r.json()


def _download_pdf(url: str, path: Path) -> None:
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    path.write_bytes(r.content)


def _upload_signed(
    api_base: str,
    job_id: str,
    token: str,
    signed_path: Path,
    cert_meta: dict,
) -> dict:
    url = f"{api_base}/api/jobs/{job_id}/complete"
    with open(signed_path, "rb") as f:
        r = requests.post(
            url,
            headers={"x-job-token": token},
            files={"file": ("signed.pdf", f, "application/pdf")},
            data={"certMeta": json.dumps(cert_meta)},
            timeout=60,
        )
    r.raise_for_status()
    return r.json()


def _format_placement(placement: dict) -> str:
    """Format placement as 'Page X • rect x,y,w,h'."""
    page = placement.get("page", "LAST")
    rect = placement.get("rectPct", {})
    x = rect.get("x", 0.64)
    y = rect.get("y", 0.06)
    w = rect.get("w", 0.32)
    h = rect.get("h", 0.1)
    return f"Trang {page} • Ô chữ ký {float(w)*100:.0f}%×{float(h)*100:.0f}%"


class SignWorker(QThread):
    log = Signal(str)
    progress = Signal(int, int)
    finished_ok = Signal(dict)
    finished_err = Signal(str)

    def __init__(
        self,
        job_id: str,
        token: str,
        api_base: str,
        cert_info: CertInfo,
        pin: str,
        cert_index: int,
        slot_no: int = 0,
    ):
        super().__init__()
        self.job_id = job_id
        self.token = token
        self.api_base = api_base
        self.cert_info = cert_info
        self.pin = pin
        self.cert_index = cert_index
        self.slot_no = slot_no

    def run(self):
        try:
            self.log.emit("Đang tải thông tin job...")
            self.progress.emit(1, 5)
            job = _fetch_job(self.api_base, self.job_id, self.token)
            input_pdf_url = job.get("inputPdfUrl")
            placement = job.get("placement", {})
            if not input_pdf_url:
                self.finished_err.emit("Job không có inputPdfUrl.")
                return

            rect = placement.get("rectPct", {})
            page = placement.get("page", "LAST")
            rect_pct = (
                float(rect.get("x", 0.64)),
                float(rect.get("y", 0.06)),
                float(rect.get("w", 0.32)),
                float(rect.get("h", 0.1)),
            )

            self.log.emit("Đang tìm PKCS#11 driver...")
            self.progress.emit(2, 5)
            dll_path = get_pkcs11_dll(os.environ.get("PKCS11_DLL"))

            self.log.emit("Đang tải PDF...")
            self.progress.emit(3, 5)
            with tempfile.TemporaryDirectory() as tmp:
                input_path = Path(tmp) / "input.pdf"
                output_path = Path(tmp) / "signed.pdf"
                _download_pdf(input_pdf_url, input_path)

                self.log.emit("Đang ký PDF...")
                self.progress.emit(4, 5)
                sign_pdf_sync(
                    input_path=input_path,
                    output_path=output_path,
                    lib_path=str(dll_path),
                    cert_info=self.cert_info,
                    pin=self.pin,
                    page_spec=page,
                    rect_pct=rect_pct,
                    slot_no=self.slot_no,
                    cert_index=self.cert_index,
                )

                try:
                    import zoneinfo
                    tz = zoneinfo.ZoneInfo("Asia/Ho_Chi_Minh")
                    signing_time = datetime.now(tz).isoformat()
                except ImportError:
                    signing_time = datetime.now().isoformat()

                cert_meta = {
                    "subjectO": self.cert_info.subject_o,
                    "subjectCN": self.cert_info.subject_cn,
                    "serial": self.cert_info.serial,
                    "signingTime": signing_time,
                }

                self.log.emit("Đang tải lên server...")
                self.progress.emit(5, 5)
                result = _upload_signed(
                    self.api_base, self.job_id, self.token, output_path, cert_meta
                )
            self.finished_ok.emit(result)
        except requests.RequestException as e:
            resp = getattr(e, "response", None)
            body = resp.text if resp else str(e)
            self.finished_err.emit(f"Lỗi mạng: {body}")
        except (FileNotFoundError, RuntimeError) as e:
            self.finished_err.emit(str(e))
        except Exception as e:
            self.finished_err.emit(f"Lỗi: {e}")


def _claim_job(api_base: str, job_id: str, code: str) -> dict:
    """POST /api/jobs/:jobId/claim with { code } -> { jobToken, apiBaseUrl }"""
    url = f"{api_base}/api/jobs/{job_id}/claim"
    r = requests.post(
        url,
        headers={"Content-Type": "application/json"},
        json={"code": code},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


class FetchJobWorker(QThread):
    finished_ok = Signal(dict)
    finished_err = Signal(str)

    def __init__(self, job_id: str, code: str, api_base: str):
        super().__init__()
        self.job_id, self.code, self.api_base = job_id, code, api_base

    def run(self):
        try:
            claim = _claim_job(self.api_base, self.job_id, self.code)
            token = claim.get("jobToken")
            api_base = claim.get("apiBaseUrl", self.api_base).rstrip("/")
            if not token:
                self.finished_err.emit("Claim response missing jobToken.")
                return
            job = _fetch_job(api_base, self.job_id, token)
            job["_token"] = token
            job["_apiBaseUrl"] = api_base
            self.finished_ok.emit(job)
        except requests.RequestException as e:
            resp = getattr(e, "response", None)
            msg = resp.text if resp else str(e)
            if resp and resp.status_code == 401:
                msg = "Invalid or expired claim code. Create a new signing job on the web."
            elif resp and resp.status_code == 410:
                msg = "Job expired. Create a new signing job on the web."
            self.finished_err.emit(msg)
        except Exception as e:
            self.finished_err.emit(str(e))


class MainWindow(QMainWindow):
    def __init__(self, deep_link_params: dict | None = None):
        super().__init__()
        self.deep_link_params = deep_link_params
        self.job_data: dict | None = None
        self.cert_infos: list[CertInfo] = []
        self.slot_no = 0
        self.dll_path: Path | None = None
        self.sign_worker: SignWorker | None = None

        self.setWindowTitle("PDFSignPro Signer")
        self.setMinimumSize(440, 520)
        self.resize(480, 580)

        central = QWidget()
        self.setCentralWidget(central)
        layout = QVBoxLayout(central)
        layout.setSpacing(20)
        layout.setContentsMargins(24, 24, 24, 24)

        self.stack = QStackedWidget()
        layout.addWidget(self.stack)

        self._build_loading_page()
        self._build_main_page()
        self._build_signing_page()
        self._build_success_page()

        if deep_link_params:
            self.stack.setCurrentIndex(0)
            self._append_loading_log("Parsed URL: pdfsignpro://sign?p=...")
            self._append_loading_log("Claiming job...")
            self._start_fetch_job()
        else:
            self._show_idle_page()

    def _build_loading_page(self):
        page = QWidget()
        v = QVBoxLayout(page)
        v.setSpacing(16)
        self.loading_label = QLabel("Job loading…")
        self.loading_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.loading_label.setStyleSheet("font-size: 14px; font-weight: 500;")
        v.addWidget(self.loading_label)
        self.loading_spinner = QProgressBar()
        self.loading_spinner.setRange(0, 0)
        self.loading_spinner.setFixedHeight(6)
        v.addWidget(self.loading_spinner)
        self.loading_log = QTextEdit()
        self.loading_log.setReadOnly(True)
        self.loading_log.setMaximumHeight(120)
        self.loading_log.setStyleSheet(
            "background-color: #18181b; color: #a1a1aa; border: 1px solid rgba(255,255,255,0.06); "
            "border-radius: 6px; padding: 8px; font-size: 12px;"
        )
        v.addWidget(self.loading_log)
        self.stack.addWidget(page)

    def _append_loading_log(self, msg: str):
        if hasattr(self, "loading_log"):
            self.loading_log.append(msg)

    def _build_main_page(self):
        page = QWidget()
        v = QVBoxLayout(page)
        v.setSpacing(16)

        # Document card
        doc_card = QFrame()
        doc_card.setObjectName("card")
        doc_card.setProperty("card", True)
        doc_layout = QVBoxLayout(doc_card)
        doc_layout.setSpacing(6)
        doc_layout.setContentsMargins(16, 14, 16, 14)
        self.doc_title = QLabel("")
        self.doc_title.setWordWrap(True)
        f = self.doc_title.font()
        f.setPointSize(13)
        f.setWeight(QFont.Weight.DemiBold)
        self.doc_title.setFont(f)
        doc_layout.addWidget(self.doc_title)
        self.doc_public_id = QLabel("")
        self.doc_public_id.setObjectName("muted")
        self.doc_public_id.setStyleSheet("font-size: 12px;")
        doc_layout.addWidget(self.doc_public_id)
        self.placement_label = QLabel("")
        self.placement_label.setObjectName("muted")
        self.placement_label.setStyleSheet("font-size: 11px;")
        doc_layout.addWidget(self.placement_label)
        v.addWidget(doc_card)

        # Certificate
        cert_label = QLabel("Chứng thư số")
        cert_label.setStyleSheet("font-size: 12px; font-weight: 500;")
        v.addWidget(cert_label)
        self.cert_combo = QComboBox()
        self.cert_combo.setMinimumHeight(40)
        v.addWidget(self.cert_combo)

        # PIN
        pin_label = QLabel("PIN token")
        pin_label.setStyleSheet("font-size: 12px; font-weight: 500;")
        v.addWidget(pin_label)
        self.pin_input = QLineEdit()
        self.pin_input.setEchoMode(QLineEdit.EchoMode.Password)
        self.pin_input.setPlaceholderText("Nhập PIN")
        self.pin_input.setMinimumHeight(40)
        v.addWidget(self.pin_input)

        # Load certs + Sign
        btn_row = QHBoxLayout()
        self.load_certs_btn = QPushButton("Tải chứng thư")
        self.load_certs_btn.clicked.connect(self._load_certs)
        btn_row.addWidget(self.load_certs_btn)
        self.sign_btn = QPushButton("Ký số")
        self.sign_btn.setObjectName("primary")
        self.sign_btn.setMinimumHeight(44)
        self.sign_btn.setEnabled(False)
        self.sign_btn.clicked.connect(self._on_sign_clicked)
        btn_row.addWidget(self.sign_btn, 1)
        v.addLayout(btn_row)

        # Progress
        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        self.progress_bar.setFixedHeight(6)
        v.addWidget(self.progress_bar)

        # Log
        log_label = QLabel("Nhật ký")
        log_label.setStyleSheet("font-size: 12px; font-weight: 500;")
        v.addWidget(log_label)
        self.log_area = QTextEdit()
        self.log_area.setReadOnly(True)
        self.log_area.setMaximumHeight(100)
        self.log_area.setPlaceholderText("parse url → fetch job → download pdf → scan token → sign → upload complete")
        v.addWidget(self.log_area)

        self.stack.addWidget(page)

    def _build_signing_page(self):
        """Screen 3: Signing in progress (disable inputs)."""
        page = QWidget()
        v = QVBoxLayout(page)
        v.setSpacing(16)
        self.signing_label = QLabel("Đang ký...")
        self.signing_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.signing_label.setStyleSheet("font-size: 14px; font-weight: 500;")
        v.addWidget(self.signing_label)
        self.signing_progress = QProgressBar()
        self.signing_progress.setRange(0, 5)
        self.signing_progress.setValue(0)
        self.signing_progress.setFixedHeight(8)
        v.addWidget(self.signing_progress)
        self.signing_log = QTextEdit()
        self.signing_log.setReadOnly(True)
        self.signing_log.setStyleSheet(
            "background-color: #18181b; color: #a1a1aa; border: 1px solid rgba(255,255,255,0.06); "
            "border-radius: 6px; padding: 8px; font-size: 12px;"
        )
        v.addWidget(self.signing_log)
        self.stack.addWidget(page)

    def _build_success_page(self):
        page = QWidget()
        v = QVBoxLayout(page)
        v.setAlignment(Qt.AlignmentFlag.AlignCenter)
        v.setSpacing(24)

        success_label = QLabel("Ký thành công")
        f = success_label.font()
        f.setPointSize(18)
        f.setWeight(QFont.Weight.DemiBold)
        success_label.setFont(f)
        success_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        v.addWidget(success_label)

        self.open_btn = QPushButton("Mở tài liệu trên web")
        self.open_btn.setObjectName("primary")
        self.open_btn.setMinimumHeight(48)
        f = self.open_btn.font()
        f.setPointSize(12)
        self.open_btn.setFont(f)
        self.open_btn.clicked.connect(self._on_open_browser)
        v.addWidget(self.open_btn, alignment=Qt.AlignmentFlag.AlignCenter)

        close_btn = QPushButton("Đóng")
        close_btn.clicked.connect(self.close)
        v.addWidget(close_btn, alignment=Qt.AlignmentFlag.AlignCenter)

        self.stack.addWidget(page)

    def _show_idle_page(self):
        page = QWidget()
        v = QVBoxLayout(page)
        v.setAlignment(Qt.AlignmentFlag.AlignCenter)
        v.setSpacing(20)
        label = QLabel(
            "PDFSignPro Signer\n\n"
            "Mở ứng dụng từ PDFSignPro Cloud:\n"
            "Bấm 'Ký số' trên tài liệu → 'Mở PDFSignPro Signer'"
        )
        label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        label.setWordWrap(True)
        label.setObjectName("muted")
        label.setStyleSheet("font-size: 13px; line-height: 1.5;")
        v.addWidget(label)
        self.stack.addWidget(page)
        self.stack.setCurrentWidget(page)

    def _start_fetch_job(self):
        if not self.deep_link_params:
            return
        p = self.deep_link_params
        worker = FetchJobWorker(p["jobId"], p["code"], p["apiBaseUrl"])
        worker.finished_ok.connect(self._on_job_fetched)
        worker.finished_err.connect(self._on_fetch_error)
        worker.start()

    def _on_job_fetched(self, job: dict):
        self._append_loading_log("Job claimed and fetched.")
        token = job.pop("_token", None)
        api_base = job.pop("_apiBaseUrl", None)
        if token and api_base and self.deep_link_params:
            self.deep_link_params = {
                **self.deep_link_params,
                "token": token,
                "apiBaseUrl": api_base,
            }
        self.job_data = job
        doc = job.get("document", {})
        placement = job.get("placement", {})

        self.doc_title.setText(doc.get("title", "Tài liệu") or "Tài liệu")
        self.doc_public_id.setText(f"ID: {doc.get('publicId', '')}")
        self.placement_label.setText(_format_placement(placement))

        try:
            self.dll_path = get_pkcs11_dll(os.environ.get("PKCS11_DLL"))
            self._append_loading_log("PKCS#11 driver found.")
        except FileNotFoundError as e:
            QMessageBox.critical(self, "Lỗi", str(e))
            return

        self.stack.setCurrentIndex(1)
        self.cert_combo.clear()
        self.pin_input.clear()

    def _load_certs(self):
        if not self.dll_path:
            return
        pin = self.pin_input.text()
        if not pin:
            QMessageBox.warning(self, "Thiếu PIN", "Vui lòng nhập PIN token trước.")
            return
        try:
            self.cert_infos, self.slot_no = list_certs_from_token(
                str(self.dll_path), pin=pin
            )
        except RuntimeError as e:
            QMessageBox.critical(self, "Lỗi", str(e))
            return

        self.cert_combo.clear()
        for c in self.cert_infos:
            name = get_signer_name(c)
            self.cert_combo.addItem(f"{name} • Serial {c.serial} • Đến {c.valid_to}", c)
        self.sign_btn.setEnabled(self.cert_combo.count() > 0)

    def _on_fetch_error(self, msg: str):
        QMessageBox.critical(self, "Lỗi", msg)
        self.loading_label.setText("Lỗi tải job")

    def _on_sign_clicked(self):
        if not self.deep_link_params or not self.job_data or not self.dll_path:
            return
        idx = self.cert_combo.currentIndex()
        if idx < 0 or idx >= len(self.cert_infos):
            QMessageBox.warning(self, "Lỗi", "Chọn chứng thư số.")
            return
        pin = self.pin_input.text()
        if not pin:
            QMessageBox.warning(self, "Lỗi", "Nhập PIN token.")
            return

        self.sign_btn.setEnabled(False)
        self.load_certs_btn.setEnabled(False)
        self.stack.setCurrentIndex(2)
        self.signing_log.clear()
        self.signing_progress.setValue(0)

        p = self.deep_link_params
        self.sign_worker = SignWorker(
            job_id=p["jobId"],
            token=p["token"],
            api_base=p["apiBaseUrl"],
            cert_info=self.cert_infos[idx],
            pin=pin,
            cert_index=idx,
            slot_no=self.slot_no,
        )
        self.sign_worker.log.connect(self._append_signing_log)
        self.sign_worker.progress.connect(self.signing_progress.setValue)
        self.sign_worker.finished_ok.connect(self._on_sign_ok)
        self.sign_worker.finished_err.connect(self._on_sign_err)
        self.sign_worker.start()

    def _append_signing_log(self, msg: str):
        self.signing_log.append(msg)
        self.log_area.append(msg)

    def _on_sign_ok(self, result: dict):
        self.sign_worker = None
        self.sign_btn.setEnabled(True)
        self.load_certs_btn.setEnabled(True)
        self.progress_bar.setVisible(False)
        self.signed_public_url = result.get("signedPublicUrl", "")
        self.stack.setCurrentIndex(2)

    def _on_sign_err(self, msg: str):
        self.sign_worker = None
        self.sign_btn.setEnabled(True)
        self.load_certs_btn.setEnabled(True)
        self.stack.setCurrentIndex(1)
        QMessageBox.critical(self, "Lỗi ký", msg)

    def _on_open_browser(self):
        import webbrowser
        url = getattr(self, "signed_public_url", "") or getattr(self, "signed_api_base", "")
        if url:
            webbrowser.open(url)


def _extract_deep_link_from_argv() -> dict | None:
    """Scan sys.argv for any pdfsignpro:// URL."""
    for arg in sys.argv[1:]:
        if isinstance(arg, str) and arg.strip().lower().startswith("pdfsignpro://"):
            return _parse_deep_link(arg)
    return None


def main():
    # CLI: --in, --out -> delegate to sign_pades
    if "--in" in sys.argv or "--help" in sys.argv or "-h" in sys.argv:
        from sign_pades import main as cli_main
        old = sys.argv
        sys.argv = ["sign_pades"] + sys.argv[1:]
        try:
            sys.exit(cli_main())
        finally:
            sys.argv = old

    app = QApplication(sys.argv)
    app.setApplicationName("PDFSignPro Signer")
    app.setStyle("Fusion")

    # Linear dark theme
    app.setStyleSheet(LINEAR_DARK)
    font = QFont("Segoe UI", 10)
    app.setFont(font)

    deep_link_params = _extract_deep_link_from_argv()

    win = MainWindow(deep_link_params=deep_link_params)
    win.show()
    win.raise_()
    win.activateWindow()
    sys.exit(app.exec())


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        from PySide6.QtWidgets import QApplication, QMessageBox
        app = QApplication.instance() or QApplication(sys.argv)
        QMessageBox.critical(
            None,
            "PDFSignPro Signer - Lỗi",
            f"Ứng dụng gặp lỗi khi khởi động:\n\n{str(e)}\n\n"
            "Đảm bảo đã cài qua PDFSignProSignerSetup.exe để đăng ký pdfsignpro://",
        )
        sys.exit(1)
