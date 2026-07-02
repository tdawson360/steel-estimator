import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import prisma from './db';

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        });

        if (!user || !user.active) {
          return null;
        }

        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) {
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: String(user.id),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.firstName = user.firstName;
        token.lastName = user.lastName;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.firstName = token.firstName;
        session.user.lastName = token.lastName;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    // Rolling session tuned for a solo internal tool: losing in-progress estimate
    // work costs more than a long-lived cookie risks. The JWT is re-issued with a
    // fresh 30-day expiry whenever the client touches the session endpoint
    // (updateAge caps how often), so active use never expires mid-workday; only
    // 30 days of complete inactivity logs the user out.
    // TODO (PostgreSQL migration): add periodic DB refresh in the jwt callback
    // to re-check user.role and user.active on each request or on a timed interval.
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 60 * 60,
  },
  secret: process.env.NEXTAUTH_SECRET || process.env.SESSION_SECRET,
};
