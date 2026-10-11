import os,re,sys
s=sys.stdin.read()
for name,value in os.environ.items():
 if value and re.search(r'PASSWORD|TOKEN|SECRET|API_KEY|SERVICE_ROLE_KEY|STAGING_DB_URL|COOKIE',name,re.I):
  s=s.replace(value,'[REDACTED]')
for pattern in [r'hf_[A-Za-z0-9]{8,}',r'sk-[A-Za-z0-9_-]{8,}',r'sk_(?:live|test)_[A-Za-z0-9]{8,}',r'sb_(?:secret|publishable)_[A-Za-z0-9_-]{8,}',r'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}',r'base64-[A-Za-z0-9+/_=-]{20,}']:
 s=re.sub(pattern,'[REDACTED]',s)
s=re.sub(r'("(?:secret|password|access_token|refresh_token|token|ciphertext|iv|tag)"\s*:\s*")[^"]*"',r'\1[REDACTED]"',s,flags=re.I)
s=re.sub(r'(Bearer\s+)[^\s"\']+',r'\1[REDACTED]',s,flags=re.I)
s=re.sub(r'(postgres(?:ql)?://[^:]+:)[^@]+@',r'\1[REDACTED]@',s)
sys.stdout.write(s)
