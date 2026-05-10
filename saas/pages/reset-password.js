import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function ResetPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const handleReset = async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`
    });

    if (!error) setSent(true);
  };

  return (
    <div style={{ padding: '40px', color: '#f9c300', background: '#111', minHeight: '100vh' }}>
      <h1>Reset Password</h1>

      {sent ? (
        <p>Check your email for the reset link.</p>
      ) : (
        <>
          <input
            type="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: '10px', width: '250px' }}
          />
          <br /><br />
          <button onClick={handleReset} style={{ padding: '10px 20px' }}>
            Send Reset Link
          </button>
        </>
      )}
    </div>
  );
}
