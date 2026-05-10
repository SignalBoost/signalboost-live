
import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Nav from '../../components/Nav';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  async function handleSignup(e) {
    e.preventDefault();

    const { error } = await supabase.auth.signUp({
      email,
      password
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage('Signup successful. Check your email.');
    }
  }

  return (
    <>
      <Nav />

      <div style={{ padding: '40px', color: 'white', background: '#111', minHeight: '100vh' }}>
        <h1>Create Account</h1>

        <form onSubmit={handleSignup}>
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
            Sign Up
          </button>
        </form>

        <p>{message}</p>
      </div>
    </>
  );
}
