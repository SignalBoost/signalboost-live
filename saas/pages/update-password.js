import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function UpdatePassword() {
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);

  const handleUpdate = async () => {
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) setDone(true);
  };

  return (
    <div style={{ padding: '40px', color: '#f9c300', background: '#111', minHeight: '100vh' }}>
      <h1>Set New Password</h1>

      {done ? (
        <p>Password updated. You can now log in.</p>
      ) : (
        <>
          <input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: '10px', width: '250px' }}
          />
          <br /><br />
          <button onClick={handleUpdate} style={{ padding: '10px 20px' }}>
            Update Password
          </button>
        </>
      )}
    </div>
  );
}
