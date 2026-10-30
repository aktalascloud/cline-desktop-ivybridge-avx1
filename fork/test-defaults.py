"""Offline parser and MCP checks; no user state, search requests or LLM inference."""
import importlib.util,json,pathlib,subprocess,sys
root=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('free_web_search_fixture',root/'defaults/free-web-search.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
parser=module.Results();parser.feed('<a class="result-link" href="https://example.org/docs">Example &amp; docs</a><td class="result-snippet">Public <b>text</b>.</td><a class="result-link" href="javascript:evil()">Not a URL</a><a class="result-link" href="/l/?uddg=https%3A%2F%2Fexample.net%2Fpage">Second</a>')
assert len(parser.rows)==2 and parser.rows[0]['title']=='Example & docs' and parser.rows[1]['url']=='https://example.net/page'
try:module.search('')
except ValueError:pass
else:raise AssertionError('empty query accepted')
p=subprocess.Popen([sys.executable,'-I','-B','-X','utf8',str(root/'defaults/free-web-search.py')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf8')
def request(rid,method,params):
 p.stdin.write(json.dumps({'jsonrpc':'2.0','id':rid,'method':method,'params':params})+'\n');p.stdin.flush();value=json.loads(p.stdout.readline());assert value['id']==rid;return value
try:
 assert request(1,'initialize',{'protocolVersion':'2024-11-05'})['result']['capabilities']=={'tools':{}}
 assert request(2,'tools/list',{})['result']['tools'][0]['name']=='web_search'
 assert request(3,'tools/call',{'name':'web_search','arguments':{'query':''}})['result']['isError']
finally:p.stdin.close();p.wait(timeout=20)
print('Free-search parser, URL filtering, MCP initialization and input validation passed; external requests=0')
