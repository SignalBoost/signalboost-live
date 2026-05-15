import './globals.css'

export const metadata = {
  title: 'SignalBoost',
  description: 'Turn reviews into global content',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      {/* Make sure there isn't a style here like bg-black text-black hiding everything */}
      <body>{children}</body>
    </html>
  )
}
