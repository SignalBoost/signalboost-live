#!/usr/bin/env python3
"""Credentials stay out of command arguments and evidence; staging identities fail closed."""
import json, os, subprocess, sys, urllib.parse, urllib.request, urllib.error, http.cookiejar
from pathlib import Path

def env(name):
    value=os.environ.get(name,'')
    if not value: raise ValueError('Missing required variable: '+name)
    return value

def origin(url):
    u=urllib.parse.urlsplit(url)
    if u.scheme!='https' or not u.hostname or u.username or u.password or u.query or u.fragment:
        raise ValueError('Invalid staging HTTPS target')
    return f'https://{u.netloc}'

def targets():
    ref=env('STAGING_PROJECT_REF_ALLOWED')
    if not ref.isalnum() or len(ref)<8: raise ValueError('Explicit staging project reference required')
    sup=env('STAGING_SUPABASE_URL')
    if sup.rstrip('/')!='https://'+ref+'.supabase.co': raise ValueError('Supabase target differs from staging allowlist')
    app=env('STAGING_APP_URL')
    allowed=env('STAGING_APP_ORIGIN_ALLOWED')
    if origin(app)!=allowed or app.rstrip('/')!=allowed or origin(allowed)!=allowed:
        raise ValueError('App target differs from staging allowlist')
    u=urllib.parse.urlsplit(env('STAGING_DB_URL'))
    if u.scheme not in ('postgres','postgresql') or u.hostname!=env('STAGING_DB_HOST_ALLOWED'):
        raise ValueError('Database host differs from staging allowlist')
    if urllib.parse.unquote(u.path.lstrip('/'))!=env('STAGING_DB_NAME_ALLOWED'):
        raise ValueError('Database name differs from staging allowlist')
    # Common Supabase direct host or pooler username must also bind to the allowed reference.
    user=urllib.parse.unquote(u.username or '')
    if u.hostname!='db.'+ref+'.supabase.co' and not user.endswith('.'+ref):
        raise ValueError('Database connection does not bind to staging project reference')
    if not u.password: raise ValueError('Database password required in operator environment')
    return u

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args): return None

def request(base,path,headers,method='GET',data=None):
    if not path.startswith('/') or path.startswith('//'): raise ValueError('Invalid API path')
    req=urllib.request.Request(base.rstrip('/')+path,data=data,headers=headers,method=method)
    try:
        with urllib.request.build_opener(NoRedirect()).open(req,timeout=120) as response:
            return response.status,response.read()
    except urllib.error.HTTPError as e: return e.code,e.read()

def session(who):
    if who not in ('A','B'): raise ValueError('Invalid customer selector')
    payload=json.dumps({'email':env('CUSTOMER_'+who+'_EMAIL'),'password':env('CUSTOMER_'+who+'_PASSWORD')}).encode()
    status,b=request(env('STAGING_SUPABASE_URL'),'/auth/v1/token?grant_type=password',{'apikey':env('STAGING_SUPABASE_ANON_KEY'),'content-type':'application/json'},'POST',payload)
    if status!=200: raise ValueError('Customer sign-in failed (HTTP '+str(status)+')')
    value=json.loads(b)
    if not value.get('access_token'): raise ValueError('Customer session missing access token')
    return value

def cookie(value):
    import base64
    ref=urllib.parse.urlsplit(env('STAGING_SUPABASE_URL')).hostname.split('.')[0]
    name=os.environ.get('SB_COOKIE_NAME','sb-'+ref+'-auth-token')
    v='base64-'+base64.urlsafe_b64encode(json.dumps(value,separators=(',',':')).encode()).decode().rstrip('=')
    chunks=[v[i:i+3180] for i in range(0,len(v),3180)]
    return name+'='+chunks[0] if len(chunks)==1 else '; '.join(name+'.'+str(i)+'='+c for i,c in enumerate(chunks))

def api(who,method,path,data=None):
    return request(env('STAGING_APP_URL'),path,{'cookie':cookie(session(who)),'content-type':'application/json'},method,data)

def manifest(value):
    if value.get('ok') is not True or not isinstance(value.get('files'),list) or not value['files']:
        raise ValueError('Download manifest failed, malformed or empty')
    seen=set()
    for f in value['files']:
        if not isinstance(f,dict) or not isinstance(f.get('path'),str) or not f['path'] or f['path'] in seen:
            raise ValueError('Invalid or duplicate manifest path')
        if type(f.get('size')) is not int or f['size']<0: raise ValueError('Invalid file size')
        seen.add(f['path'])
    return value['files']

def main():
    action=sys.argv[1]
    if action=='prompts':
        rows=list(dict.fromkeys(l.strip()[:4000] for l in sys.stdin.read().splitlines() if l.strip()))
        if not 20<=len(rows)<=128: raise ValueError('Require 20–128 distinct prompts before any paid request')
        return
    if action=='validate-manifest': manifest(json.load(sys.stdin)); return
    if action=='cookie': sys.stdout.write(cookie(json.load(sys.stdin))); return
    u=targets()
    if action=='targets': return
    if action=='psql':
        e=os.environ.copy()
        for k in ('STAGING_DB_URL','STAGING_SERVICE_ROLE_KEY','CUSTOMER_A_PASSWORD','CUSTOMER_B_PASSWORD'): e.pop(k,None)
        e.update(PGHOST=u.hostname,PGPORT=str(u.port or 5432),PGDATABASE=urllib.parse.unquote(u.path.lstrip('/')),PGUSER=urllib.parse.unquote(u.username or ''),PGPASSWORD=urllib.parse.unquote(u.password or ''),PGCONNECT_TIMEOUT='15',PGSSLMODE='verify-full')
        query=urllib.parse.parse_qs(u.query)
        if set(query)-{'sslmode'}: raise ValueError('Unsupported DB connection options; configure explicitly')
        # Never allow the connection URL or password in argv.
        sys.exit(subprocess.call(['psql','-X','-v','ON_ERROR_STOP=1','-qAt',*sys.argv[2:]],env=e))
    if action=='session': sys.stdout.write(json.dumps(session(sys.argv[2]))); return
    if action=='api':
        body=sys.stdin.buffer.read(); status,b=api(sys.argv[2],sys.argv[3],sys.argv[4],body or None)
        print(status); sys.stdout.write(b.decode()); return
    if action in ('create-user','delete-user','provision'):
        key=env('STAGING_SERVICE_ROLE_KEY');headers={'apikey':key,'authorization':'Bearer '+key,'content-type':'application/json'}
        if action=='create-user':
            who=sys.argv[2];status,b=request(env('STAGING_SUPABASE_URL'),'/auth/v1/admin/users',headers,'POST',json.dumps({'email':env('CUSTOMER_'+who+'_EMAIL'),'password':env('CUSTOMER_'+who+'_PASSWORD'),'email_confirm':True,'user_metadata':{'lab_staging_disposable':True}}).encode())
        elif action=='delete-user':status,b=request(env('STAGING_SUPABASE_URL'),'/auth/v1/admin/users/'+urllib.parse.quote(sys.argv[2],safe=''),headers,'DELETE')
        else:status,b=request(env('STAGING_SUPABASE_URL'),'/rest/v1/rpc/itmounts_lab_provision_owner_organization',headers,'POST',json.dumps({'p_owner_user_id':sys.argv[2],'p_organization_name':sys.argv[3]}).encode())
        if not 200<=status<300: raise ValueError(action+' failed (HTTP '+str(status)+')')
        value=json.loads(b);print(value.get('id','') if action=='create-user' else value if action=='provision' else 'deleted');return
    if action=='downloads':
        files=manifest(json.load(sys.stdin));who_cookie=cookie(session('A'))
        headers={'cookie':who_cookie}
        for f in files:
            query=urllib.parse.urlencode({'organizationId':env('ORG_A'),'runId':env('RUN_A'),'path':f['path']})
            req=urllib.request.Request(env('STAGING_APP_URL')+'/api/lab/training/download?'+query,headers=headers)
            size=0
            with urllib.request.build_opener(NoRedirect()).open(req,timeout=300) as response:
                if response.status!=200: raise ValueError('Artifact download rejected')
                while True:
                    chunk=response.read(65536)
                    if not chunk:break
                    size+=len(chunk)
                    if size>f['size']:raise ValueError('Artifact size exceeds manifest')
            if size!=f['size']:raise ValueError('Artifact size differs from manifest')
            print(json.dumps({'path':f['path'],'status':200,'bytes':size}))
        return
    raise ValueError('Unknown action')
if __name__=='__main__':
    try:main()
    except Exception as e:
        # Network errors can contain URLs or headers; emit only a bounded known validation message.
        print(str(e) if isinstance(e,ValueError) else 'Operation failed; inspect securely on staging',file=sys.stderr);sys.exit(1)
