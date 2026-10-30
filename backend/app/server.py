"""
Local Python Backend HTTP Server for SmartFix AI
Runs on http://127.0.0.1:8000 to serve local development and test requests.
Proxy target for Vite development server (via vite.config.js).
"""
import sys
import os
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

# Ensure backend package is in python search path
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.abspath(os.path.join(current_dir, "..", ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from backend.app.api import handle_api_request


class ApiRequestHandler(BaseHTTPRequestHandler):
    def _handle_request(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body_bytes = self.rfile.read(content_length) if content_length > 0 else b""
        body_str = body_bytes.decode("utf-8", errors="replace")

        # Map headers
        headers_dict = {k: v for k, v in self.headers.items()}

        response = handle_api_request(
            path=self.path,
            method=self.command,
            headers=headers_dict,
            body_data=body_str
        )

        status_code = response.get("statusCode", 200)
        resp_headers = response.get("headers", {})
        resp_body = response.get("body", "{}")

        self.send_response(status_code)
        for h_key, h_val in resp_headers.items():
            self.send_header(h_key, h_val)
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
