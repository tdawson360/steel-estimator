import './globals.css'

export const metadata = {
  title: 'Steel Estimator',
  description: 'Professional steel fabrication estimating tool',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
