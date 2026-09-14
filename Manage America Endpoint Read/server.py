"""
Simple proxy server — serves index.html and proxies /api/* requests
to ThingsBoard so the browser never hits CORS issues.

Usage:  python server.py
        Then open http://localhost:8080
"""

import http.server
import urllib.request
import urllib.error
import json
import os

PORT = 8080
TB_BASE = "https://thingsboard.dunelabs.ai"

class ProxyHandler(http.server.SimpleHTTPRequestHandler):

    def do_GET(self):
        if self.path.startswith("/api/"):
            self._proxy("GET")
        else:
            super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            self._proxy("POST")
        else:
            self.send_error(405)

    def _proxy(self, method):
        url = TB_BASE + self.path
        content_len = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_len) if content_len > 0 else None

        req = urllib.request.Request(url, data=body, method=method)

        # Forward key headers
        for hdr in ("Authorization", "Content-Type"):
            val = self.headers.get(hdr)
            if val:
                req.add_header(hdr, val)

        try:
            with urllib.request.urlopen(req) as resp:
                resp_body = resp.read()
                self.send_response(resp.status)
                self.send_header("Content-Type",
                                 resp.headers.get("Content-Type", "application/json"))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(resp_body)
        except urllib.error.HTTPError as e:
            resp_body = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type",
                             e.headers.get("Content-Type", "application/json"))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(resp_body)
        except Exception as e:
            msg = json.dumps({"error": str(e)}).encode()
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(msg)

    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.end_headers()


os.chdir(os.path.dirname(os.path.abspath(__file__)))
print(f"Serving on http://localhost:{PORT}")
print(f"Proxying /api/* → {TB_BASE}")
http.server.HTTPServer(("", PORT), ProxyHandler).serve_forever()
