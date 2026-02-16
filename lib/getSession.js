import { getServerSession } from 'next-auth';
import { authOptions } from './auth';

export async function getSession() {
  return await getServerSession(authOptions);
}

export async function requireAuth() {
  const session = await getSession();
  if (!session?.user) {
    return null;
  }
  return session.user;
}

export function requireRole(user, allowedRoles) {
  if (!user) return false;
  return allowedRoles.includes(user.role);
}
