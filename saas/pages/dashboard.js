import Nav from '../components/Nav';

export default function Dashboard() {
  return (
    <>
      <Nav />

      <div style={{ padding: '40px', background: '#111', color: 'white', minHeight: '100vh' }}>
        <h1>Dashboard</h1>
        <p>Dashboard temporarily simplified while fixing deployment.</p>
      </div>
    </>
  );
}
