// saas/components/auth/SignUpForm.tsx
'use client';
import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useI18n } from '@/components/i18n/I18nProvider';
import { t } from '@/lib/i18n/t';

function SignUpFormContent() {
  const searchParams = useSearchParams();
  const { dict } = useI18n();
  const [email, setEmail] = useState('');
  const [source, setSource] = useState('organic');

  useEffect(() => {
    if (searchParams) {
      const originParam = searchParams.get('source');
      if (originParam) setSource(originParam);
    }
  }, [searchParams]);

  return (
    <div className="p-6 bg-white rounded-xl border max-w-sm mx-auto shadow-sm">
      <h2 className="text-xl font-bold mb-2">{t(dict, 'signupForm.title', 'Create Account')}</h2>
      <p className="text-xs text-slate-500 mb-4">{t(dict, 'signupForm.source', 'Source')}: {source}</p>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full px-3 py-2 border rounded-lg text-sm mb-3"
        placeholder={t(dict, 'signupForm.emailPlaceholder', 'you@example.com')}
      />
      <button className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
        {t(dict, 'signupForm.button', 'Sign Up')}
      </button>
    </div>
  );
}

export default function SignUpForm() {
  return (
    <Suspense fallback={<div>{t(undefined as any, 'common.loading', 'Loading...')}</div>}>
      <SignUpFormContent />
    </Suspense>
  );
}
