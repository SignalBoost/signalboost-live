// components/auth/SignUpForm.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/utils/supabase/client';

export default function SignUpForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState('organic');

  // Automatically check the URL structure for marketing/origin sources on load
  useEffect(() => {
    const originParam = searchParams.get('source');
    if (originParam) {
      setSource(originParam);
    }
  }, [searchParams]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Passing data into metadata ensures our Postgres trigger maps it correctly
        data: {
          full_name: fullName,
          signup_source: source, 
        },
      },
    });

    setLoading(false);

    if (error) {
      alert(`Error signing up: ${error.message}`);
    } else {
      alert('Signup successful! Check your email for verification.');
    }
  };

  return (
    <form onSubmit={handleSignUp} className="flex flex-col gap-4 max-w-md mx-auto p-6 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-2">Create your SaaS Account</h2>
      
      <input 
        type="text" 
        placeholder="Full Name" 
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        className="border p-2 rounded"
        required 
      />
      <input 
        type="email" 
        placeholder="Email Address" 
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="border p-2 rounded"
        required 
      />
      <input 
        type="password" 
        placeholder="Password" 
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="border p-2 rounded"
        required 
      />

      <button 
        type="submit" 
        disabled={loading}
        className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Creating account...' : 'Sign Up'}
      </button>
    </form>
  );
}
