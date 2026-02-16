import './globals.css';
import SessionProvider from '../components/SessionProvider';

export const metadata = {
  title: 'Steel Estimator',
  description: 'Professional steel fabrication estimating tool',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
