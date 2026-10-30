#!/usr/bin/env python3
"""Local visual prompt comparison tool. Run with python3 scripts/prompt_tuner_web.py."""
import json
import os
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import prompt_tuner as tuner

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
tuner._load_env()

HTML = '''<!doctype html><html><head><meta charset="utf-8"><title>Clinical document model comparison</title><style>
*{box-sizing:border-box}body{font:15px system-ui;background:#f3f5f8;color:#17243b;margin:0}main{max-width:1400px;margin:auto;padding:28px}h1{margin:0 0 5px}p{color:#56647a}label{display:block;font-weight:650;margin:14px 0 6px}select,input,textarea,button{font:inherit;border:1px solid #cbd4df;border-radius:7px;padding:10px}select,input,textarea{width:100%;background:white}textarea{min-height:180px;resize:vertical}button{background:#245bd1;color:white;border:0;font-weight:700;cursor:pointer;margin-top:15px}button:disabled{opacity:.6}.controls{background:white;padding:20px;border-radius:10px}.row,.outputs{display:grid;grid-template-columns:1fr 1fr;gap:16px}.card{background:white;padding:20px;border-radius:10px;margin-top:18px;min-width:0}.result{white-space:pre-wrap;line-height:1.55;overflow-wrap:anywhere}.error{color:#a32929}small{color:#56647a}@media(max-width:700px){.row,.outputs{grid-template-columns:1fr}}
</style></head><body><main><h1>Clinical document comparison</h1><p>Compare Gemini and GPT outputs from the same transcript and prompt.</p><div class="controls"><div class="row"><div><label>Prompt</label><select id="prompt"></select></div><div><label>Patient name (optional)</label><input id="name"></div><div><label>Gemini model</label><input id="gemini" value="gemini-3.5-flash-lite"></div><div><label>OpenAI model</label><input id="openai" value="gpt-6-luna"></div></div><label>Transcript</label><textarea id="transcript" placeholder="Paste a de-identified transcript here"></textarea><small>Both providers receive this transcript. API calls may incur charges. Outputs need clinician review.</small><br><button id="run">Compare models</button><p id="status"></p></div><div class="outputs"><div class="card"><h2>Gemini</h2><div id="gresult" class="result">Output appears here.</div></div><div class="card"><h2>OpenAI</h2><div id="oresult" class="result">Output appears here.</div></div></div></main><script>
const $=id=>document.getElementById(id);fetch('/config').then(r=>r.json()).then(c=>{for(const p of c.prompts){let o=document.createElement('option');o.value=p;o.textContent=p;$('prompt').append(o)}$('prompt').value='new-letter';$('status').textContent='Gemini key: '+(c.gemini?'available':'missing')+'; OpenAI key: '+(c.openai?'available':'missing')});$('run').onclick=async()=>{if(!$('transcript').value.trim()){ $('status').textContent='Enter a transcript first.';return} $('run').disabled=true;$('status').textContent='Generating outputs…';$('gresult').textContent='Waiting…';$('oresult').textContent='Waiting…';try{let r=await fetch('/compare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:$('prompt').value,name:$('name').value,transcript:$('transcript').value,gemini:$('gemini').value,openai:$('openai').value})});let data=await r.json();$('gresult').textContent=data.gemini||data.error||'No output';$('oresult').textContent=data.openai||data.error||'No output';$('status').textContent='Complete. Review both outputs against the transcript.'}catch(e){$('status').textContent='Request failed: '+e.message}finally{$('run').disabled=false}};
</script></body></html>'''

class Handler(BaseHTTPRequestHandler):
    def send(self, code, body, kind='application/json'):
        data = body.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', kind + '; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/':
            self.send(200, HTML, 'text/html')
        elif self.path == '/config':
            self.send(200, json.dumps({'prompts': sorted(tuner.PROMPT_FILES), 'gemini': bool(os.getenv('GEMINI_API_KEY')), 'openai': bool(os.getenv('OPENAI_API_KEY'))}))
        else:
            self.send(404, '{}')

    def do_POST(self):
        if self.path != '/compare':
            self.send(404, '{}'); return
        # Prevent other websites from invoking this local service.
        if self.headers.get('Origin') != f'http://{self.headers.get("Host")}' or self.headers.get('Content-Type') != 'application/json':
            self.send(403, json.dumps({'error': 'Invalid request origin.'})); return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0 or length > 2_000_000: raise ValueError('Invalid request size.')
            data = json.loads(self.rfile.read(length))
            key = data['prompt']
            if key not in tuner.PROMPT_FILES: raise ValueError('Unknown prompt.')
            transcript = data['transcript'].strip()
            if not transcript: raise ValueError('Transcript is empty.')
            prompt = tuner._load_prompt_from_ts(tuner.PROMPT_FILES[key])
            name = data.get('name', '').strip()
            doc_type = 'consult_note' if 'consult-note' in key else 'referrer_letter'
            def run(provider):
                try:
                    api_key = os.getenv('GEMINI_API_KEY' if provider == 'gemini' else 'OPENAI_API_KEY')
                    if not api_key: return 'Missing API key. Add it to .env.local and restart the tool.'
                    model = data[provider].strip()
                    if not model or not all(c.isalnum() or c in '-._' for c in model): raise ValueError('Invalid model name.')
                    func = tuner._generate_letter if provider == 'gemini' else tuner._generate_openai
                    return func(prompt, transcript, name, model, api_key, doc_type)
                except Exception as exc:
                    return f'Generation failed: {exc}'
            with ThreadPoolExecutor(max_workers=2) as pool:
                gemini = pool.submit(run, 'gemini')
                openai = pool.submit(run, 'openai')
                result = {'gemini': gemini.result(), 'openai': openai.result()}
            self.send(200, json.dumps(result))
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
            self.send(400, json.dumps({'error': str(exc)}))

    def log_message(self, format, *args):
        pass

if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 8765), Handler)
    print('Open http://127.0.0.1:8765', flush=True)
    server.serve_forever()
