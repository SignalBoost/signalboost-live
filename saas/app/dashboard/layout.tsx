import React from 'react'
import Topbar from '@/components/Topbar'
import Concierge from '@/components/Concierge'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <style>{`
        body {
          background:
            radial-gradient(circle at 18% 0%, rgba(59, 130, 246, 0.18), transparent 34%),
            radial-gradient(circle at 88% 18%, rgba(255, 195, 0, 0.10), transparent 28%),
            radial-gradient(circle at 48% 80%, rgba(34, 197, 94, 0.08), transparent 32%),
            #060913 !important;
          color: #f8fafc;
        }

        .signalboost-dashboard-refresh {
          min-height: calc(100vh - 72px);
          padding-top: 22px;
          position: relative;
          isolation: isolate;
        }

        .signalboost-dashboard-refresh::before {
          content: '';
          position: fixed;
          inset: 0;
          z-index: -1;
          pointer-events: none;
          background-image:
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
          background-size: 42px 42px;
          mask-image: linear-gradient(to bottom, rgba(0,0,0,.60), transparent 82%);
        }

        .signalboost-dashboard-refresh .fathom-glass {
          background: linear-gradient(135deg, rgba(9, 14, 29, 0.82), rgba(8, 12, 24, 0.56)) !important;
          border: 1px solid rgba(148, 163, 184, 0.16) !important;
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.04) !important;
        }

        .signalboost-dashboard-refresh a.fathom-glass:hover,
        .signalboost-dashboard-refresh button:hover {
          transform: translateY(-1px);
        }

        .signalboost-dashboard-refresh input,
        .signalboost-dashboard-refresh textarea,
        .signalboost-dashboard-refresh select {
          background: rgba(2, 6, 23, 0.72) !important;
          border-color: rgba(148, 163, 184, 0.18) !important;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03) !important;
        }

        .signalboost-dashboard-refresh input:focus,
        .signalboost-dashboard-refresh textarea:focus,
        .signalboost-dashboard-refresh select:focus {
          border-color: rgba(59, 130, 246, 0.72) !important;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.04) !important;
        }

        .signalboost-dashboard-refresh button,
        .signalboost-dashboard-refresh a {
          transition: transform .18s ease, border-color .18s ease, background .18s ease, box-shadow .18s ease, opacity .18s ease;
        }

        .signalboost-dashboard-refresh button[disabled] {
          transform: none !important;
        }

        .signalboost-dashboard-refresh .terminal-text {
          letter-spacing: .015em;
        }

        @media (max-width: 980px) {
          .signalboost-dashboard-refresh [style*='grid-template-columns: repeat(4,1fr)'],
          .signalboost-dashboard-refresh [style*='grid-template-columns: repeat(3,1fr)'] {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }

        @media (max-width: 640px) {
          .signalboost-dashboard-refresh {
            padding-top: 14px;
          }

          .signalboost-dashboard-refresh [style*='grid-template-columns: repeat(4,1fr)'],
          .signalboost-dashboard-refresh [style*='grid-template-columns: repeat(3,1fr)'],
          .signalboost-dashboard-refresh [style*='grid-template-columns: repeat(2, minmax(0, 1fr))'] {
            grid-template-columns: 1fr !important;
          }

          .signalboost-dashboard-refresh [style*='display: flex'] {
            max-width: 100%;
          }
        }
      `}</style>
      <Topbar />
      <main className="signalboost-dashboard-refresh">
        {children}
      </main>
      <Concierge />
    </>
  )
}
