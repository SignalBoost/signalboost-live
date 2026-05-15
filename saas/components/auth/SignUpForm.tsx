// saas/components/auth/SignUpForm.tsx
'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function SignUpFormContent() {
  const searchParams = useSearchParams();
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
      <h2 className="text-xl font-bold mb-2">Create Account</h2>
      <p className="text-xs text-slate-500 mb-4">Source: {source}</p>
      <input 
        type="email" 
        value={email} 
        onChange={(e) => setEmail(e.target.value)} 
        className="w-full px-3 py-2 border rounded-lg text-sm mb-3" 
        placeholder="you@example.com" 
      />
      <button className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
        Sign Up
      </button>
    </div>
  );
}

export default function SignUpForm() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SignUpFormContent />
    </Suspense>
  );
}
