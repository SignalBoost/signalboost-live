import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Nav from '../../components/Nav';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  async function handleLogin(e) {
    e.preventDefault();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      setMessage(error.message);
    } else {
      window.location.href = '/dashboard';
    }
  }

  return (
    <>
      <Nav />

      <div style={{ padding: '40px', color: 'white', background: '#111', minHeight: '100vh' }}>
        <h1>Login</h1>

        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ display: 'block', marginBottom: '10px' }}
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ display: 'block', marginBottom: '10px' }}
          />

          <button type="submit">
            Login
          </button>
        </form>

        <p>{message}</p>
      </div>
    </>
  );
}
