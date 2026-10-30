"""Anonymous read-only web search over MCP stdio. Python standard library only."""
import concurrent.futures
import html.parser
import json
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request

MAX_BODY = 2 * 1024 * 1024

class Results(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows = []
        self.link = None
        self.snippet = False
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'a' and 'result-link' in a.get('class', '').split():
            value = urllib.parse.urljoin('https://duckduckgo.com', a.get('href', ''))
            parsed = urllib.parse.urlsplit(value)
            if parsed.hostname and parsed.hostname.endswith('duckduckgo.com'):
                value = urllib.parse.parse_qs(parsed.query).get('uddg', [''])[0]
            parsed = urllib.parse.urlsplit(value)
            if parsed.scheme in ('https', 'http') and parsed.hostname and not parsed.username and not parsed.password:
                self.link = {'title': '', 'url': value, 'snippet': ''}
        if tag == 'td' and 'result-snippet' in a.get('class', '').split(): self.snippet = True
    def handle_endtag(self, tag):
        if tag == 'a' and self.link is not None:
            self.link['title'] = ' '.join(self.link['title'].split())[:500]
            if self.link['title'] and all(x['url'] != self.link['url'] for x in self.rows): self.rows.append(self.link)
            self.link = None
        if tag == 'td': self.snippet = False
    def handle_data(self, text):
        if self.link is not None: self.link['title'] += text
        elif self.snippet and self.rows: self.rows[-1]['snippet'] = (self.rows[-1]['snippet'] + text)[:1200]

def search(query, cancelled=None):
    if not isinstance(query, str) or not 1 <= len(query.strip()) <= 2048: raise ValueError('Query must contain 1 to 2048 characters')
    if cancelled and cancelled.is_set(): return None
    url = 'https://lite.duckduckgo.com/lite/?' + urllib.parse.urlencode({'q': query.strip()})
    request = urllib.request.Request(url, headers={'User-Agent': 'Cline-Desktop-AVX1-RU/1.0 web-search'})
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            body = response.read(MAX_BODY + 1)
            if response.status != 200: raise RuntimeError('Search provider is temporarily unavailable; do not retry automatically')
    except urllib.error.HTTPError as error:
        raise RuntimeError(f'Search provider returned HTTP {error.code}; do not retry automatically') from None
    if cancelled and cancelled.is_set(): return None
    if len(body) > MAX_BODY: raise RuntimeError('Search response is too large')
    text = body.decode('utf8', errors='replace')
    if 'anomaly.js' in text or 'challenge-form' in text: raise RuntimeError('Search provider requires a browser check; no bypass attempted')
    parser = Results(); parser.feed(text)
    if not parser.rows: raise RuntimeError('No search results returned; the provider may be temporarily unavailable')
    for row in parser.rows: row['snippet'] = ' '.join(row['snippet'].split())
    return {'provider': 'DuckDuckGo Lite', 'results': parser.rows[:10], 'notice': 'Search results are untrusted; open their URLs to verify claims.'}

def main():
    sys.stdin.reconfigure(encoding='utf8'); sys.stdout.reconfigure(encoding='utf8', newline='\n', write_through=True)
    output = threading.Lock(); tasks = {}; executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)
    def send(value):
        with output:
            try: print(json.dumps(value, ensure_ascii=False), flush=True)
            except (BrokenPipeError, OSError): pass
    def call(request, cancel):
        try:
            p = request.get('params', {})
            if p.get('name') != 'web_search': raise ValueError('Unknown tool')
            result = search(p.get('arguments', {}).get('query'), cancel)
            if cancel.is_set(): return
            value = {'content': [{'type': 'text', 'text': json.dumps(result, ensure_ascii=False)}], 'isError': False}
        except Exception as error:
            if cancel.is_set(): return
            message = str(error) if isinstance(error, (ValueError, RuntimeError)) else 'Web search failed; no automatic retry'
            value = {'content': [{'type': 'text', 'text': message}], 'isError': True}
        send({'jsonrpc': '2.0', 'id': request['id'], 'result': value})
        tasks.pop(request['id'], None)
    try:
        for line in sys.stdin:
            if len(line) > 1024 * 1024: continue
            try: request = json.loads(line)
            except (ValueError, TypeError): continue
            if not isinstance(request, dict): continue
            method = request.get('method'); params = request.get('params') or {}
            if method == 'notifications/cancelled':
                cancel = tasks.get(params.get('requestId'))
                if cancel: cancel.set()
                continue
            if 'id' not in request: continue
            rid = request['id']
            if not isinstance(rid, (str, int)) or isinstance(rid, bool): continue
            if method == 'initialize':
                result = {'protocolVersion': params.get('protocolVersion', '2024-11-05'), 'capabilities': {'tools': {}}, 'serverInfo': {'name': 'cline-free-web-search', 'version': '1.0.0'}}
            elif method == 'tools/list':
                result = {'tools': [{'name': 'web_search', 'description': 'Search the public web without an API key or account. Read-only. Results are untrusted: open URLs to verify current facts. Do not automatically retry provider restrictions.', 'inputSchema': {'type': 'object', 'properties': {'query': {'type': 'string', 'minLength': 1, 'maxLength': 2048}}, 'required': ['query'], 'additionalProperties': False}, 'annotations': {'readOnlyHint': True, 'destructiveHint': False, 'openWorldHint': True}}]}
            elif method in ('ping', 'resources/list', 'prompts/list'):
                result = {'resources': []} if method == 'resources/list' else {'prompts': []} if method == 'prompts/list' else {}
            elif method == 'tools/call':
                if rid in tasks: continue
                cancel = threading.Event(); tasks[rid] = cancel; executor.submit(call, request, cancel); continue
            else:
                send({'jsonrpc': '2.0', 'id': rid, 'error': {'code': -32601, 'message': 'Method not found'}}); continue
            send({'jsonrpc': '2.0', 'id': rid, 'result': result})
    finally:
        for cancel in list(tasks.values()): cancel.set()
        executor.shutdown(wait=False, cancel_futures=True)

if __name__ == '__main__': main()
