'use client'

type Caption = { text: string; start: number; end: number; x: number; y: number; style?: React.CSSProperties }

export default function CanvasEditor({ videoSrc, captions }: { videoSrc: string; captions: Caption[] }) {
  return (
    <div className="rounded border border-white/10 p-4">
      <video src={videoSrc} controls className="w-full" />
      <div className="mt-3 space-y-2">
        {captions.map((caption) => (
          <p key={`${caption.start}-${caption.end}-${caption.text}`} style={caption.style}>{caption.text}</p>
        ))}
      </div>
    </div>
  )
}
