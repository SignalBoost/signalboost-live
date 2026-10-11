import importlib.util,os,subprocess,json,unittest,secrets,urllib.parse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('safe',ROOT/'lib/safe_io.py');safe=importlib.util.module_from_spec(spec);spec.loader.exec_module(safe)
class Safety(unittest.TestCase):
 def setUp(self):
  self.original=dict(os.environ)
  self.password=secrets.token_urlsafe(24)
  db_url=urllib.parse.urlunsplit(('postgresql','postgres:'+self.password+'@db.abcdefgh1234.supabase.co:5432','/postgres','',''))
  os.environ.update(STAGING_PROJECT_REF_ALLOWED='abcdefgh1234',STAGING_SUPABASE_URL='https://abcdefgh1234.supabase.co',STAGING_APP_URL='https://staging.example.com',STAGING_APP_ORIGIN_ALLOWED='https://staging.example.com',STAGING_DB_HOST_ALLOWED='db.abcdefgh1234.supabase.co',STAGING_DB_NAME_ALLOWED='postgres',STAGING_DB_URL=db_url)
 def tearDown(self):os.environ.clear();os.environ.update(self.original)
 def test_correct_staging_identity(self):self.assertEqual(safe.targets().hostname,'db.abcdefgh1234.supabase.co')
 def test_production_ref_rejected(self):
  os.environ['STAGING_SUPABASE_URL']='https://production999.supabase.co'
  with self.assertRaises(ValueError):safe.targets()
 def test_wrong_db_rejected(self):
  os.environ['STAGING_DB_URL']=urllib.parse.urlunsplit(('postgresql','postgres:'+self.password+'@db.production999.supabase.co','/postgres','',''))
  with self.assertRaises(ValueError):safe.targets()
 def test_missing_allowlist_rejected(self):
  os.environ.pop('STAGING_PROJECT_REF_ALLOWED')
  with self.assertRaises(ValueError):safe.targets()
 def test_empty_or_error_manifest_rejected(self):
  for value in ({'ok':True,'files':[]},{'ok':False,'files':[{'path':'x','size':1}]},{}):
   with self.assertRaises(ValueError):safe.manifest(value)
 def test_nonempty_manifest(self):self.assertEqual(len(safe.manifest({'ok':True,'files':[{'path':'weights.bin','size':20}]})),1)
 def test_prompt_validation(self):
  for n,success in [(3,False),(20,True),(129,False)]:
   r=subprocess.run(['python3',str(ROOT/'lib/safe_io.py'),'prompts'],input='\n'.join('prompt '+str(i) for i in range(n)),text=True,capture_output=True)
   self.assertEqual(r.returncode==0,success)
 def test_password_scrubbed(self):
  os.environ['CUSTOMER_A_PASSWORD']='odd-password-without-prefix'
  r=subprocess.run(['python3',str(ROOT/'lib/redact.py')],input='odd-password-without-prefix hf_ABCDEFGHIJKLMN',text=True,capture_output=True)
  self.assertNotIn('odd-password',r.stdout);self.assertNotIn('ABCDEFGHIJKLMN',r.stdout)
 def test_no_secrets_in_psql_arguments(self):
  captured={};old=safe.subprocess.call
  def fake(args,env):captured.update(args=args,env=env);return 0
  safe.subprocess.call=fake;oldargs=safe.sys.argv;safe.sys.argv=['safe_io.py','psql','-c','select 1']
  try:
   with self.assertRaises(SystemExit):safe.main()
   self.assertNotIn(self.password,' '.join(captured['args']));self.assertEqual(captured['env']['PGPASSWORD'],self.password)
  finally:safe.subprocess.call=old;safe.sys.argv=oldargs
 def test_shell_syntax(self):
  for f in [*ROOT.glob('*.sh'),*ROOT.glob('lib/*.sh')]:self.assertEqual(subprocess.run(['bash','-n',str(f)]).returncode,0)
if __name__=='__main__':unittest.main()
