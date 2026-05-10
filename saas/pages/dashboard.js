import { useSession } from '@supabase/auth-helpers-react';
import Nav from '../components/Nav';

export default function Dashboard() {
  const session = useSession();

  if (!session) {
    return (
      <>
        <Nav />

        <div style={{ padding: '40px', background: '#111', color: 'white', minHeight: '100vh' }}>
          <h1>Please log in</h1>
        </div>
      </>
    );
  }

  return (
    <>
      <Nav />

      <div style={{ padding: '40px', background: '#111', color: 'white', minHeight: '100vh' }}>
        <h1>Dashboard</h1>

        <p>
          Welcome {session.user.email}
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '20px',
          marginTop: '30px'
        }}>
          <div style={{ background: '#1b1b1b', padding: '20px', borderRadius: '10px' }}>
            <h3 style={{ color: '#f9c300' }}>
              Reviews
            </h3>

            <p>
              Manage customer reviews.
            </p>
          </div>

          <div style={{ background: '#1b1b1b', padding: '20px', borderRadius: '10px' }}>
            <h3 style={{ color: '#f9c300' }}>
              Voice Ads
            </h3>

            <p>
              Generate AI voice ads.
            </p>
          </div>

          <div style={{ background: '#1b1b1b', padding: '20px', borderRadius: '10px' }}>
            <h3 style={{ color: '#f9c300' }}>
              Websites
            </h3>

            <p>
              Build landing pages instantly.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
