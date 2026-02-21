import './globals.css';
import SessionProvider from '../components/SessionProvider';
import Providers from '../components/Providers';

export const metadata = {
  title: 'Steel Estimator',
  description: 'Professional steel fabrication estimating tool',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          <SessionProvider>
            {children}
          </SessionProvider>
        </Providers>
      </body>
    </html>
  );
}
