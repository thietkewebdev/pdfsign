#!/usr/bin/env python3
"""Local PKI services for B-T / B-LT / B-LTA tests (no internet needed).

  http://127.0.0.1:18080/ca.cert.der   AIA caIssuers
  http://127.0.0.1:18080/ca.crl        CRL (regenerated at start, valid 30 days)
  http://127.0.0.1:18080/tsa           RFC 3161 TSA (openssl ts -reply)
  http://127.0.0.1:18081               OCSP responder (openssl ocsp)

Usage: scripts/pki_services.py [PKI_DIR]   (default tests/fixtures/pki-ltv); Ctrl+C to stop.
Requires the openssl CLI.
"""
import http.server
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "tests/fixtures/pki-ltv"
HTTP_PORT = int(os.environ.get("PKI_HTTP_PORT", "18080"))
OCSP_PORT = int(os.environ.get("PKI_OCSP_PORT", "18081"))

# Work on a copy: openssl ca/ts update index, serial and crlnumber files.
WORK = Path(tempfile.mkdtemp(prefix="pdfsign-pki-"))
shutil.copytree(SRC, WORK, dirs_exist_ok=True)
subprocess.run(
    ["openssl", "ca", "-gencrl", "-config", "ca.cnf", "-out", "ca.crl.pem"],
    cwd=WORK, check=True, capture_output=True,
)
subprocess.run(
    ["openssl", "crl", "-in", "ca.crl.pem", "-outform", "DER", "-out", "ca.crl"],
    cwd=WORK, check=True,
)
TSA_LOCK = threading.Lock()


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write("[pki] " + (fmt % args) + "\n")

    def _send(self, body: bytes, ctype: str, code: int = 200):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        files = {"/ca.cert.der": ("ca.cert.der", "application/pkix-cert"), "/ca.crl": ("ca.crl", "application/pkix-crl")}
        if self.path not in files:
            return self._send(b"not found", "text/plain", 404)
        name, ctype = files[self.path]
        self._send((WORK / name).read_bytes(), ctype)

    def do_POST(self):
        if self.path != "/tsa":
            return self._send(b"not found", "text/plain", 404)
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        with TSA_LOCK, tempfile.TemporaryDirectory() as td:
            q, r = Path(td) / "q.tsq", Path(td) / "r.tsr"
            q.write_bytes(body)
            res = subprocess.run(
                ["openssl", "ts", "-reply", "-config", "tsa.cnf", "-queryfile", str(q), "-out", str(r)],
                cwd=WORK, capture_output=True,
            )
            if res.returncode != 0:
                return self._send(res.stderr, "text/plain", 500)
            self._send(r.read_bytes(), "application/timestamp-reply")


def main():
    ocsp = subprocess.Popen(
        ["openssl", "ocsp", "-index", "index.txt", "-port", str(OCSP_PORT), "-rsigner", "ocsp.cert.pem",
         "-rkey", "ocsp.key.pem", "-CA", "ca.cert.pem", "-ndays", "7"],
        cwd=WORK, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    server = http.server.ThreadingHTTPServer(("127.0.0.1", HTTP_PORT), Handler)

    def stop(*_):
        ocsp.terminate()
        threading.Thread(target=server.shutdown).start()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    print(f"PKI services: http://127.0.0.1:{HTTP_PORT} (ca.cert.der, ca.crl, /tsa), OCSP :{OCSP_PORT}", flush=True)
    try:
        server.serve_forever()
    finally:
        ocsp.terminate()
        shutil.rmtree(WORK, ignore_errors=True)


if __name__ == "__main__":
    main()
