'use client'

export default function Concierge() {
  return (
    <button
      style={{
        position: 'fixed',
        right: 30,
        bottom: 30,
        zIndex: 999999,
        width: 180,
        height: 80,
        background: 'red',
        color: 'white',
        fontSize: 24,
        fontWeight: 900,
        border: '5px solid yellow',
        borderRadius: 20,
        cursor: 'pointer',
      }}
    >
      CONCIERGE TEST
    </button>
  )
}
