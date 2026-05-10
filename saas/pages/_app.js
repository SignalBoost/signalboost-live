import '../styles/globals.css';
import Link from 'next/link';

export default function MyApp({ Component, pageProps }) {
  return (
    <>
      <header style={{ padding: '20px', background: '#111', color: '#fff' }}>
        <nav style={{ display: 'flex', gap: '20px' }}>
          <Link href="/generator">Website Generator</Link>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/signup">Sign Up</Link>
          <Link href="/login">Login</Link>
        </nav>
      </header>

      <Component {...pageProps} />
    </>
  );
}
