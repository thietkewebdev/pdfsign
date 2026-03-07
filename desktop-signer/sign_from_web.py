#!/usr/bin/env python3
"""
PDFSignPro Desktop Signer - Entry point for web deep link and CLI.

When launched via deep link: pdfsignpro://sign?jobId=...&code=...&u=...
  -> Claims job (exchanges code for token), fetches job, downloads PDF, signs, uploads.

When launched with --in/--out: CLI mode (delegates to sign_pades).

When launched with no args: Shows help and waits for user to press Enter.
"""
import getpass
import json
import os
import sys
import tempfile
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import requests

# Add package to path when run as script
sys.path.insert(0, str(Path(__file__).resolve().parent))

from signer.pkcs11_discovery import get_pkcs11_dll
from signer.cert_selector import (
    list_certs_from_token,
    CertInfo,
    get_signer_name,
)
from signer.pades_signer import sign_pdf_sync


def _pause_on_error():
    """Keep console open so user can read the error."""
    try:
        input("\nNhấn Enter để thoát...")
    except (EOFError, KeyboardInterrupt):
        pass


def _parse_deep_link(url: str) -> dict | None:
    """Parse pdfsignpro://sign?jobId=...&code=...&u=... (or legacy token/apiBaseUrl)."""
    if not url or not url.strip().lower().startswith("pdfsignpro://"):
        return None
    parsed = urlparse(url)
    if parsed.scheme.lower() != "pdfsignpro" or parsed.netloc.lower() != "sign":
        return None
    qs = parse_qs(parsed.query)
    job_id = (qs.get("jobId") or qs.get("jobid") or [None])[0]
    code = (qs.get("code") or [None])[0]
    hostname = (qs.get("u") or [None])[0]
    token = (qs.get("token") or [None])[0]
    api_base = (qs.get("apiBaseUrl") or qs.get("apibaseurl") or [None])[0]

    # New format: jobId + code + u (hostname)
    if job_id and code and hostname:
        is_local = hostname == "localhost" or hostname.startswith("localhost:")
        scheme = "http" if is_local else "https"
        port = ":3000" if hostname == "localhost" else ""
        api_base = f"{scheme}://{hostname}{port}"
        return {"jobId": job_id, "code": code, "apiBaseUrl": api_base}

    # Legacy: jobId + token + apiBaseUrl
    if job_id and token and api_base:
        api_base = api_base.rstrip("/")
        return {"jobId": job_id, "token": token, "apiBaseUrl": api_base}

    return None


def _claim_job(api_base: str, job_id: str, code: str) -> tuple[str, str]:
    """POST /api/jobs/[jobId]/claim with {code}, return (jobToken, apiBaseUrl)."""
    url = f"{api_base.rstrip('/')}/api/jobs/{job_id}/claim"
    r = requests.post(
        url,
        json={"code": code},
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    return data["jobToken"], data["apiBaseUrl"]


def _fetch_job(api_base: str, job_id: str, token: str) -> dict:
    """GET /api/jobs/[jobId] with x-job-token header."""
    url = f"{api_base}/api/jobs/{job_id}"
    r = requests.get(url, headers={"x-job-token": token}, timeout=30)
    r.raise_for_status()
    return r.json()


def _download_pdf(url: str, path: Path) -> None:
    """Download PDF from URL to path."""
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    path.write_bytes(r.content)


def _upload_signed(api_base: str, job_id: str, token: str, signed_path: Path) -> dict:
    """POST /api/jobs/[jobId]/complete with multipart file."""
    url = f"{api_base}/api/jobs/{job_id}/complete"
    with open(signed_path, "rb") as f:
        r = requests.post(
            url,
            headers={"x-job-token": token},
            files={"file": ("signed.pdf", f, "application/pdf")},
            timeout=60,
        )
    r.raise_for_status()
    return r.json()


def run_deep_link(params: dict) -> int:
    """Run full flow: claim (if code) -> fetch job -> download -> sign -> upload."""
    job_id = params["jobId"]
    api_base = params["apiBaseUrl"]

    # Resolve token: either from claim (new format) or direct (legacy)
    if "code" in params:
        try:
            token, api_base = _claim_job(api_base, job_id, params["code"])
        except requests.RequestException as e:
            err = getattr(e, "response", None)
            body = err.text if err else str(e)
            print(f"Lỗi: Không claim được job: {body}", file=sys.stderr)
            return 1
    else:
        token = params["token"]

    print("PDFSignPro Signer - Chế độ ký từ web")
    print(f"Job: {job_id}")
    print()

    # 1. Fetch job
    try:
        job = _fetch_job(api_base, job_id, token)
    except requests.RequestException as e:
        err = getattr(e, "response", None)
        body = err.text if err else str(e)
        print(f"Lỗi: Không lấy được job: {body}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Lỗi kết nối: {e}", file=sys.stderr)
        return 1

    input_pdf_url = job.get("inputPdfUrl")
    placement = job.get("placement", {})
    if not input_pdf_url:
        print("Lỗi: Job không có inputPdfUrl", file=sys.stderr)
        return 1

    rect = placement.get("rectPct", {})
    page = placement.get("page", "LAST")
    rect_pct = (
        float(rect.get("x", 0.64)),
        float(rect.get("y", 0.06)),
        float(rect.get("w", 0.32)),
        float(rect.get("h", 0.1)),
    )

    # 2. PKCS#11
    try:
        dll_path = get_pkcs11_dll(os.environ.get("PKCS11_DLL"))
        print(f"PKCS#11: {dll_path}")
    except FileNotFoundError as e:
        print(f"Lỗi: {e}", file=sys.stderr)
        return 1

    pin = getpass.getpass("Nhập PIN token: ")
    if not pin:
        print("Lỗi: Cần nhập PIN.", file=sys.stderr)
        return 1

    try:
        certs, slot_no = list_certs_from_token(str(dll_path), pin=pin)
    except RuntimeError as e:
        print(f"Lỗi: {e}", file=sys.stderr)
        return 1

    print("\nChứng thư trên token:")
    for i, c in enumerate(certs):
        name = get_signer_name(c)
        print(f"  [{i}] {name}")

    idx = 0
    if len(certs) > 1:
        try:
            idx = int(input("\nChọn chứng thư (số): "))
            if idx < 0 or idx >= len(certs):
                print("Lỗi: Số không hợp lệ.", file=sys.stderr)
                return 1
        except ValueError:
            print("Lỗi: Nhập số.", file=sys.stderr)
            return 1

    cert_info: CertInfo = certs[idx]

    # 3. Download PDF
    with tempfile.TemporaryDirectory() as tmp:
        input_path = Path(tmp) / "input.pdf"
        output_path = Path(tmp) / "signed.pdf"
        try:
            _download_pdf(input_pdf_url, input_path)
        except Exception as e:
            print(f"Lỗi tải PDF: {e}", file=sys.stderr)
            return 1

        # 4. Sign
        print("\nĐang ký...")
        try:
            sign_pdf_sync(
                input_path=input_path,
                output_path=output_path,
                lib_path=str(dll_path),
                cert_info=cert_info,
                pin=pin,
                page_spec=page,
                rect_pct=rect_pct,
                slot_no=slot_no,
                cert_index=idx,
            )
        except Exception as e:
            print(f"Lỗi ký: {e}", file=sys.stderr)
            return 1

        # 5. Upload
        try:
            result = _upload_signed(api_base, job_id, token, output_path)
            print(f"\nĐã ký xong!")
            print(f"Xem tài liệu: {result.get('signedPublicUrl', '')}")
        except Exception as e:
            print(f"Lỗi upload: {e}", file=sys.stderr)
            return 1

    return 0


def run_cli(args: list[str]) -> int:
    """Delegate to sign_pades CLI."""
    from sign_pades import main as cli_main

    # Temporarily replace sys.argv for sign_pades
    old_argv = sys.argv
    sys.argv = ["sign_pades"] + args
    try:
        return cli_main()
    finally:
        sys.argv = old_argv


def main() -> int:
    # Check for deep link as first arg (Windows passes URL when opening pdfsignpro://)
    if len(sys.argv) >= 2:
        params = _parse_deep_link(sys.argv[1])
        if params:
            try:
                return run_deep_link(params)
            finally:
                _pause_on_error()

    # CLI mode: --in, --out required
    if "--in" in sys.argv or "--help" in sys.argv or "-h" in sys.argv:
        return run_cli(sys.argv[1:])

    # No args: show help and wait
    print("PDFSignPro Signer")
    print()
    print("Cách dùng:")
    print("  - Đăng ký deep link: Chạy register-protocol.reg (sửa đường dẫn exe trước)")
    print("  1. Từ web: Bấm 'Ký số' trên PDFSignPro Cloud, chọn 'Open PDFSignPro Desktop'")
    print("     Ứng dụng sẽ mở qua deep link và hướng dẫn ký.")
    print()
    print("  2. Từ dòng lệnh:")
    print("     PDFSignProSigner.exe --in input.pdf --out signed.pdf [--page LAST] [--rectPct 0.64,0.06,0.32,0.10]")
    print()
    print("Đảm bảo đã cắm USB token và cài driver (Viettel, VNPT, v.v.)")
    _pause_on_error()
    return 0


if __name__ == "__main__":
    try:
        code = main()
        if code != 0:
            _pause_on_error()
        sys.exit(code)
    except Exception as e:
        print(f"Lỗi: {e}", file=sys.stderr)
        import traceback

        traceback.print_exc()
        _pause_on_error()
        sys.exit(1)
