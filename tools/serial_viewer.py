"""Live viewer for the 3063 debug-UART log (and any other timestamped log).

Usage: python tools/serial_viewer.py [port] [logfile]
Serves a single page that tails the file every 2 s, with a substring filter,
pause, and a session/TI-monitor highlight. Read-only: never touches the port.
"""
import http.server, json, os, sys, urllib.parse

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
LOG = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "3063-uart-0909.log")

PAGE = """<!doctype html><html><head><meta charset="utf-8"><title>3063 serial</title>
<style>
body{margin:0;background:#0f1115;color:#d6d9df;font:13px/1.35 Consolas,Menlo,monospace}
#bar{position:sticky;top:0;background:#171a21;border-bottom:1px solid #2a2f3a;padding:8px 12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
#bar b{color:#8ab4f8}
input{background:#0f1115;color:#d6d9df;border:1px solid #2a2f3a;padding:4px 8px;border-radius:4px;width:260px}
button{background:#232838;color:#d6d9df;border:1px solid #2a2f3a;padding:4px 10px;border-radius:4px;cursor:pointer}
button.on{background:#3a2a2a;border-color:#a55}
#log{padding:8px 12px;white-space:pre;overflow-x:auto}
.ln{display:block}.ts{color:#6b7280}.radio{color:#8ab4f8}.ti{color:#f0b429}.warn{color:#f28b82}.ok{color:#81c995}
#meta{color:#6b7280;margin-left:auto}
</style></head><body>
<div id="bar"><b>3063 debug UART</b>
<input id="q" placeholder="filter (substring, case-insensitive)">
<label><input type="checkbox" id="hl" checked style="width:auto"> highlight</label>
<button id="pause">pause</button>
<button id="clear">clear view</button>
<span id="meta"></span></div>
<div id="log"></div>
<script>
let paused=false, lastN=0, shown=[];
const q=document.getElementById('q'), log=document.getElementById('log'), meta=document.getElementById('meta');
document.getElementById('pause').onclick=e=>{paused=!paused;e.target.textContent=paused?'resume':'pause';e.target.classList.toggle('on',paused)};
document.getElementById('clear').onclick=()=>{log.textContent='';};
function cls(l){
  if(!document.getElementById('hl').checked) return '';
  if(/RADIO|connmgr|PWRDN|FORCE OFF|TIMED OUT|session/i.test(l)) return 'radio';
  if(/ti |TI |otk|cal |EOT|INFO|monitor|silent|banner/i.test(l)) return 'ti';
  if(/error|fail|wedge|reset|reboot|FAULT/i.test(l)) return 'warn';
  if(/success|OK$|Metering/i.test(l)) return 'ok';
  return '';
}
function esc(s){return s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
async function tick(){
  if(paused) return;
  try{
    const r=await fetch('/tail?n=400&q='+encodeURIComponent(q.value)); const j=await r.json();
    meta.textContent=`${j.file}  |  ${j.total} lines  |  updated ${new Date().toLocaleTimeString()}`;
    const frag=j.lines.map(l=>{const m=l.match(/^(\\d\\d:\\d\\d:\\d\\d\\.\\d+) ?(.*)$/); const ts=m?m[1]:''; const body=m?m[2]:l;
      return `<span class="ln ${cls(body)}"><span class="ts">${ts}</span> ${esc(body)}</span>`;}).join('');
    const atBottom = (window.innerHeight + window.scrollY) >= document.body.offsetHeight - 40;
    log.innerHTML=frag; if(atBottom) window.scrollTo(0,document.body.scrollHeight);
  }catch(e){meta.textContent='viewer error: '+e;}
}
setInterval(tick,2000); tick();
</script></body></html>"""

class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == "/tail":
            qs = urllib.parse.parse_qs(u.query); n = int(qs.get("n", ["300"])[0]); q = (qs.get("q", [""])[0] or "").lower()
            try:
                with open(LOG, "rb") as f:
                    f.seek(0, 2); size = f.tell(); f.seek(max(0, size - 400_000)); data = f.read().decode("utf-8", "replace")
                lines = data.split("\n")[1:] if size > 400_000 else data.split("\n")
                total = sum(1 for _ in open(LOG, "rb"))
            except FileNotFoundError:
                lines, total = [f"(log not found: {LOG})"], 0
            if q: lines = [l for l in lines if q in l.lower()]
            body = json.dumps({"file": os.path.basename(LOG), "total": total, "lines": [l for l in lines if l.strip()][-n:]}).encode()
            self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
        else:
            body = PAGE.encode(); self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

if __name__ == "__main__":
    print(f"serial viewer on http://localhost:{PORT}  tailing {LOG}")
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
