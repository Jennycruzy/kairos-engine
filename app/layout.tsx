import type { Metadata } from 'next'
import { JetBrains_Mono } from 'next/font/google'
import './globals.css'

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['300', '400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'KAIRÓS ENGINE v2 — Chain-Aware Meme Agent',
  description: 'The engine does not merely analyze tokens. It confers or withholds sovereign identity.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${jetbrainsMono.variable} font-mono bg-[#080808] text-[#e8e8e8] antialiased`}>
        {children}
      </body>
    </html>
  )
}
