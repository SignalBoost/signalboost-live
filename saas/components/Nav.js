
import Link from 'next/link';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';

export default function Nav() {
  const session = useSession();
  const supabase = useSupabaseClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/auth/login';
  }

  return (
    <nav style={{ background: '#111', color: '#f9c300', padding: '10px', display: 'flex', gap: '16px' }}>
      <Link href="/">Home</Link>
      <Link href="/dashboard">Dashboard</Link>

      {session ? (
        <>
          <span>Welcome {session.user.email}</span>
          <button onClick={handleLogout}>Logout</button>
        </>
      ) : (
        <>
          <Link href="/auth/signup">Sign Up</Link>
          <Link href="/auth/login">Login</Link>
        </>
      )}
    </nav>
  );
}
