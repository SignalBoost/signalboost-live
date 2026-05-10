import { useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import Link from 'next/link';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setErrorMsg('');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      setErrorMsg(error.message);
    } else {
      window.location.href = '/dashboard';
    }

    setLoading(false);
  };

  return (
    <div style={{
      background: '#111',
      minHeight: '100vh',
      padding: '40px',
      color: '#f9c300',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }}>
      
      <h1 style={{ marginBottom: '20px' }}>Login</h1>

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{
          padding: '12px',
          width: '280px',
          marginBottom: '15px',
          borderRadius: '6px',
          border: '1px solid #333',
          background: '#222',
          color: '#fff'
        }}
      />

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{
          padding: '12px',
          width: '280px',
          marginBottom: '10px',
          borderRadius: '6px',
          border: '1px solid #333',
          background: '#222',
          color: '#fff'
        }}
      />

      {errorMsg && (
        <p style={{ color: 'red', marginBottom: '10px' }}>{errorMsg}</p>
      )}

      <button
        onClick={handleLogin}
        disabled={loading}
        style={{
          padding: '12px 20px',
          width: '280px',
          background: '#f9c300',
          color: '#111',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontWeight: 'bold',
          marginBottom: '15px'
        }}
      >
        {loading ? 'Logging in…' : 'Login'}
      </button>

      <Link href="/reset-password">
        <span style={{
          color: '#f9c300',
          cursor: 'pointer',
          textDecoration: 'underline',
          marginBottom: '20px'
        }}>
          Forgot your password
        </span>
      </Link>

      <Link href="/signup">
        <span style={{
          color: '#fff',
          cursor: 'pointer',
          textDecoration: 'underline'
        }}>
          Don’t have an account? Sign up
        </span>
      </Link>
    </div>
  );
}
