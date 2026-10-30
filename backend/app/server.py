"""
Local Python Backend HTTP Server for SmartFix AI
Runs on http://127.0.0.1:8000 to serve local development and test requests.
Proxy target for Vite development server (via vite.config.js).
"""
import sys
import os
import json
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

# Ensure backend package is in python search path
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.abspath(os.path.join(current_dir, "..", ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from backend.app.config import ENVIRONMENT
from backend.app.api import handle_api_request


class ApiRequestHandler(BaseHTTPRequestHandler):
    def _handle_request(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body_bytes = self.rfile.read(content_length) if content_length > 0 else b""
        body_str = body_bytes.decode("utf-8", errors="replace")

        # Map headers
        headers_dict = {k: v for k, v in self.headers.items()}

        try:
            response = handle_api_request(
                path=self.path,
                method=self.command,
                headers=headers_dict,
                body_data=body_str
            )
        except Exception as e:
            import traceback
            sys.stderr.write(f"[Server Error] {self.command} {self.path}: {str(e)}\n")
            traceback.print_exc()
            err_msg = "An unexpected internal server error occurred." if ENVIRONMENT == "production" else f"Internal Server Error: {str(e)}"
            response = {
                "statusCode": 500,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": headers_dict.get("Origin") or "http://localhost:5173",
                    "Access-Control-Allow-Credentials": "true",
                    "X-Content-Type-Options": "nosniff",
                    "X-Frame-Options": "DENY"
                },
                "body": json.dumps({"success": False, "error": err_msg})
            }

        status_code = response.get("statusCode", 200)
        resp_headers = response.get("headers", {})
        resp_body = response.get("body", "{}")

        self.send_response(status_code)
        for h_key, h_val in resp_headers.items():
            if h_key.lower() == "set-cookie":
                if isinstance(h_val, list):
                    for cookie in h_val:
                        self.send_header("Set-Cookie", cookie)
                elif isinstance(h_val, str) and ", smartfix_" in h_val:
                    # Multi-cookie folding split (session + csrf)
                    for cookie in h_val.split(", smartfix_"):
                        c_str = cookie if cookie.startswith("smartfix_") else f"smartfix_{cookie}"
                        self.send_header("Set-Cookie", c_str.strip())
                else:
                    self.send_header(h_key, h_val)
            else:
                self.send_header(h_key, h_val)

        multi_headers = response.get("multiValueHeaders", {})
        for h_key, vals in multi_headers.items():
            for val in vals:
                self.send_header(h_key, val)
        self.end_headers()

        if isinstance(resp_body, str):
            self.wfile.write(resp_body.encode("utf-8"))
        elif isinstance(resp_body, bytes):
            self.wfile.write(resp_body)

    def do_GET(self):
        self._handle_request()

    def do_POST(self):
        self._handle_request()

    def do_PUT(self):
        self._handle_request()

    def do_PATCH(self):
        self._handle_request()

    def do_DELETE(self):
        self._handle_request()

    def do_OPTIONS(self):
        self._handle_request()

    def log_message(self, format, *args):
        # Quiet output for clean dev experience
        sys.stderr.write("%s - - [%s] %s\n" % (self.client_address[0], self.log_date_time_string(), format % args))


def run_server(host: str = "127.0.0.1", port: int = 8000):
    server_address = (host, port)
    httpd = ThreadingHTTPServer(server_address, ApiRequestHandler)
    print(f"================================================================")
    print(f" SmartFix AI Authoritative Python Backend (Phase 2)")
    print(f" Server active on: http://{host}:{port}")
    print(f" Vite dev proxy target: http://127.0.0.1:{port}")
    print(f"================================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down Python backend server.")
        httpd.server_close()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    host = os.environ.get("HOST", "127.0.0.1")
    run_server(host, port)
