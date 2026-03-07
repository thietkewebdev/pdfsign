#!/usr/bin/env python3
"""
PDFSignPro Signer - PySide6 GUI.

When launched normally: show GUI (idle state).
When launched via deep link pdfsignpro://sign?jobId=...&token=...&apiBaseUrl=...:
  - Fetch job, show cert picker + PIN, sign, upload, show success.
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
    QListWidget,
    QListWidgetItem,
    QTextEdit,
    QProgressBar,
    QStackedWidget,
    QFrame,
    QSizePolicy,
    QMessageBox,
    QSpacerItem,
)
from PySide6.QtGui import QFont

sys.path.insert(0, str(Path(__file__).resolve().parent))

from signer.pkcs11_discovery import get_pkcs11_dll
from signer.cert_selector import list_certs_from_token, CertInfo, get_signer_name
from signer.pades_signer import sign_pdf_sync


def _parse_deep_link(url: str) -> dict | None:
    """Parse pdfsignpro://sign?jobId=...&token=...&apiBaseUrl=..."""
    if not url or not url.strip().lower().startswith("pdfsignpro://"):
        return None
    parsed = urlparse(url)
    if parsed.scheme.lower() != "pdfsignpro" or parsed.netloc.lower() != "sign":
        return None
    qs = parse_qs(parsed.query)
    job_id = (qs.get("jobId") or qs.get("jobid") or [None])[0]
    token = (qs.get("token") or [None])[0]
    api_base = (qs.get("apiBaseUrl") or qs.get("apibaseurl") or [None])[0]
    if not job_id or not token or not api_base:
        return None
    api_base = api_base.rstrip("/")
    return {"jobId": job_id, "token": token, "apiBaseUrl": api_base}


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
    """POST /api/jobs/[jobId]/complete with multipart file + certMeta."""
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


class SignWorker(QThread):
    """Worker thread for signing (fetch, sign, upload)."""

    log = Signal(str)
    progress = Signal(int, int)  # current, total
    finished_ok = Signal(dict)  # result with signedPublicUrl
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
                    self.api_base,
                    self.job_id,
                    self.token,
                    output_path,
                    cert_meta,
                )

            self.finished_ok.emit(result)
        except requests.RequestException as e:
            resp = getattr(e, "response", None)
            body = resp.text if resp else str(e)
            self.finished_err.emit(f"Lỗi mạng: {body}")
        except FileNotFoundError as e:
            self.finished_err.emit(str(e))
        except RuntimeError as e:
            self.finished_err.emit(str(e))
        except Exception as e:
            self.finished_err.emit(f"Lỗi: {e}")


class FetchJobWorker(QThread):
    """Worker to fetch job details (non-blocking)."""

    finished_ok = Signal(dict)
    finished_err = Signal(str)

    def __init__(self, job_id: str, token: str, api_base: str):
        super().__init__()
        self.job_id = job_id
        self.token = token
        self.api_base = api_base

    def run(self):
        try:
            job = _fetch_job(self.api_base, self.job_id, self.token)
            self.finished_ok.emit(job)
        except requests.RequestException as e:
            resp = getattr(e, "response", None)
            body = resp.text if resp else str(e)
            self.finished_err.emit(f"Không lấy được job: {body}")
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
        self.setMinimumSize(520, 480)
        self.resize(560, 520)

        central = QWidget()
        self.setCentralWidget(central)
        layout = QVBoxLayout(central)
        layout.setSpacing(16)
        layout.setContentsMargins(24, 24, 24, 24)

        self.stack = QStackedWidget()
        layout.addWidget(self.stack)

        self._build_loading_page()
        self._build_main_page()
        self._build_success_page()

        if deep_link_params:
            self.stack.setCurrentIndex(0)
            self._start_fetch_job()
        else:
            self._show_idle_page()

    def _build_loading_page(self):
        page = QWidget()
        v = QVBoxLayout(page)
        v.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.loading_label = QLabel("Đang tải thông tin job...")
        self.loading_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        font = self.loading_label.font()
        font.setPointSize(12)
        self.loading_label.setFont(font)
        v.addWidget(self.loading_label)
        self.loading_spinner = QProgressBar()
        self.loading_spinner.setRange(0, 0)
        self.loading_spinner.setFixedWidth(200)
        v.addWidget(self.loading_spinner, alignment=Qt.AlignmentFlag.AlignCenter)
        self.stack.addWidget(page)

    def _build_main_page(self):
        page = QWidget()
        v = QVBoxLayout(page)
        v.setSpacing(12)

        doc_frame = QFrame()
        doc_frame.setFrameShape(QFrame.Shape.StyledPanel)
        doc_frame.setStyleSheet("QFrame { background-color: palette(base); border-radius: 6px; }")
        doc_layout = QVBoxLayout(doc_frame)
        self.doc_title = QLabel("")
        self.doc_title.setWordWrap(True)
        font = self.doc_title.font()
        font.setPointSize(11)
        font.setBold(True)
        self.doc_title.setFont(font)
        doc_layout.addWidget(self.doc_title)
        self.doc_public_id = QLabel("")
        self.doc_public_id.setStyleSheet("color: palette(mid);")
        doc_layout.addWidget(self.doc_public_id)
        v.addWidget(doc_frame)

        cert_label = QLabel("Chọn chứng thư số:")
        v.addWidget(cert_label)
        self.cert_list = QListWidget()
        self.cert_list.setMinimumHeight(120)
        self.cert_list.setSelectionMode(QListWidget.SelectionMode.SingleSelection)
        v.addWidget(self.cert_list)

        pin_layout = QHBoxLayout()
        pin_label = QLabel("PIN token:")
        self.pin_input = QLineEdit()
        self.pin_input.setEchoMode(QLineEdit.EchoMode.Password)
        self.pin_input.setPlaceholderText("Nhập PIN")
        self.pin_input.setMinimumWidth(180)
        pin_layout.addWidget(pin_label)
        pin_layout.addWidget(self.pin_input)
        v.addLayout(pin_layout)

        load_certs_btn = QPushButton("Tải chứng thư")
        load_certs_btn.clicked.connect(self._load_certs)
        v.addWidget(load_certs_btn)

        self.sign_btn = QPushButton("Ký")
        self.sign_btn.setMinimumHeight(40)
        font = self.sign_btn.font()
        font.setPointSize(11)
        self.sign_btn.setFont(font)
        self.sign_btn.setEnabled(False)
        self.sign_btn.clicked.connect(self._on_sign_clicked)
        v.addWidget(self.sign_btn)

        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        v.addWidget(self.progress_bar)

        self.log_area = QTextEdit()
        self.log_area.setReadOnly(True)
        self.log_area.setMaximumHeight(100)
        self.log_area.setPlaceholderText("Nhật ký...")
        v.addWidget(self.log_area)

        self.stack.addWidget(page)

    def _build_success_page(self):
        page = QWidget()
        v = QVBoxLayout(page)
        v.setAlignment(Qt.AlignmentFlag.AlignCenter)
        v.setSpacing(20)

        success_label = QLabel("Đã ký xong!")
        font = success_label.font()
        font.setPointSize(14)
        font.setBold(True)
        success_label.setFont(font)
        success_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        v.addWidget(success_label)

        self.open_btn = QPushButton("Mở tài liệu đã ký trong trình duyệt")
        self.open_btn.setMinimumHeight(44)
        font = self.open_btn.font()
        font.setPointSize(11)
        self.open_btn.setFont(font)
        self.open_btn.clicked.connect(self._on_open_browser)
        v.addWidget(self.open_btn, alignment=Qt.AlignmentFlag.AlignCenter)

        close_btn = QPushButton("Đóng")
        close_btn.clicked.connect(self.close)
        v.addWidget(close_btn, alignment=Qt.AlignmentFlag.AlignCenter)

        self.stack.addWidget(page)

    def _show_idle_page(self):
        """Show idle state when no deep link."""
        page = QWidget()
        v = QVBoxLayout(page)
        v.setAlignment(Qt.AlignmentFlag.AlignCenter)
        v.setSpacing(16)
        label = QLabel(
            "PDFSignPro Signer\n\n"
            "Mở ứng dụng từ PDFSignPro Cloud:\n"
            "Bấm 'Ký số' trên tài liệu → 'Mở PDFSignPro Signer'"
        )
        label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        label.setWordWrap(True)
        font = label.font()
        font.setPointSize(11)
        label.setFont(font)
        v.addWidget(label)
        self.stack.addWidget(page)
        self.stack.setCurrentWidget(page)

    def _start_fetch_job(self):
        if not self.deep_link_params:
            return
        p = self.deep_link_params
        self.loading_label.setText("Đang tải thông tin job...")
        worker = FetchJobWorker(p["jobId"], p["token"], p["apiBaseUrl"])
        worker.finished_ok.connect(self._on_job_fetched)
        worker.finished_err.connect(self._on_fetch_error)
        worker.start()
        worker.finished.connect(lambda: setattr(self, "_fetch_worker", None))

    def _on_job_fetched(self, job: dict):
        self.job_data = job
        doc = job.get("document", {})
        title = doc.get("title", "Tài liệu")
        public_id = doc.get("publicId", "")

        self.doc_title.setText(title)
        self.doc_public_id.setText(f"ID: {public_id}")

        try:
            self.dll_path = get_pkcs11_dll(os.environ.get("PKCS11_DLL"))
        except FileNotFoundError as e:
            QMessageBox.critical(self, "Lỗi", str(e))
            return

        self.stack.setCurrentIndex(1)
        self.cert_list.clear()
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

        self.cert_list.clear()
        for c in self.cert_infos:
            name = get_signer_name(c)
            item = QListWidgetItem(f"{name} | Serial: {c.serial} | Đến: {c.valid_to}")
            self.cert_list.addItem(item)
        if self.cert_list.count() > 0:
            self.cert_list.setCurrentRow(0)
        self.sign_btn.setEnabled(True)

    def _on_fetch_error(self, msg: str):
        QMessageBox.critical(self, "Lỗi", msg)
        self.loading_label.setText("Lỗi tải job")

    def _on_sign_clicked(self):
        if not self.deep_link_params or not self.job_data or not self.dll_path:
            return
        idx = self.cert_list.currentRow()
        if idx < 0 or idx >= len(self.cert_infos):
            QMessageBox.warning(self, "Lỗi", "Chọn chứng thư số.")
            return
        pin = self.pin_input.text()
        if not pin:
            QMessageBox.warning(self, "Lỗi", "Nhập PIN token.")
            return

        self.sign_btn.setEnabled(False)
        self.progress_bar.setVisible(True)
        self.progress_bar.setRange(0, 5)
        self.progress_bar.setValue(0)
        self.log_area.clear()

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
        self.sign_worker.log.connect(self._append_log)
        self.sign_worker.progress.connect(
            lambda cur, tot: self.progress_bar.setValue(cur)
        )
        self.sign_worker.finished_ok.connect(self._on_sign_ok)
        self.sign_worker.finished_err.connect(self._on_sign_err)
        self.sign_worker.start()

    def _append_log(self, msg: str):
        self.log_area.append(msg)

    def _on_sign_ok(self, result: dict):
        self.sign_worker = None
        self.sign_btn.setEnabled(True)
        self.progress_bar.setVisible(False)
        self.signed_public_url = result.get("signedPublicUrl", "")
        self.stack.setCurrentIndex(2)

    def _on_sign_err(self, msg: str):
        self.sign_worker = None
        self.sign_btn.setEnabled(True)
        self.progress_bar.setVisible(False)
        QMessageBox.critical(self, "Lỗi ký", msg)

    def _on_open_browser(self):
        url = getattr(self, "signed_public_url", "")
        if url:
            import webbrowser
            webbrowser.open(url)


def main():
    # CLI mode: --in, --out -> delegate to sign_pades
    if "--in" in sys.argv or "--help" in sys.argv or "-h" in sys.argv:
        from sign_pades import main as cli_main
        old_argv = sys.argv
        sys.argv = ["sign_pades"] + sys.argv[1:]
        try:
            sys.exit(cli_main())
        finally:
            sys.argv = old_argv

    app = QApplication(sys.argv)
    app.setApplicationName("PDFSignPro Signer")
    app.setStyle("Fusion")

    deep_link_params = None
    if len(sys.argv) >= 2:
        deep_link_params = _parse_deep_link(sys.argv[1])

    win = MainWindow(deep_link_params=deep_link_params)
    win.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
