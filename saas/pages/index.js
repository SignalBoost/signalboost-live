import Nav from '../components/Nav';

export default function Home() {
  return (
    <>
      <Nav />

      <main style={{ background: '#111', color: 'white', minHeight: '100vh', padding: '60px 40px' }}>
        <h1 style={{ color: '#f9c300', fontSize: '48px' }}>
          SignalBoost
        </h1>

        <p>
          Turn reviews into branded graphics, voice ads, and website content.
        </p>
      </main>
    </>
  );
}
