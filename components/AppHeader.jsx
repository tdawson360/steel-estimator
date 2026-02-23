'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { Bell, ChevronDown, LogOut, User, Settings, Shield, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import COMPANY_LOGO from '../lib/logo.js';

const ROLE_LABELS = {
  ADMIN: 'Admin',
  ESTIMATOR: 'Estimator',
  PM: 'Project Manager',
  FIELD_SHOP: 'Field/Shop',
};

const ROLE_COLORS = {
  ADMIN: 'bg-red-100 text-red-700',
  ESTIMATOR: 'bg-blue-100 text-blue-700',
  PM: 'bg-green-100 text-green-700',
  FIELD_SHOP: 'bg-amber-100 text-amber-700',
};

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function AppHeader() {
  const { data: session } = useSession();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const [notifications, setNotifications] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const notifRef = useRef(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Notification click-outside
  useEffect(() => {
    const handler = e => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifs(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchNotifs = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) setNotifications(await res.json());
    } catch {
      // silently ignore network errors
    }
  }, []);

  // Fetch on mount, every 60s, and on tab focus
  useEffect(() => {
    if (!session?.user) return;
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 60000);
    const onVisible = () => { if (document.visibilityState === 'visible') fetchNotifs(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchNotifs, session?.user]);

  if (!session?.user) return null;

  const user = session.user;
  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
  const role = user.role || 'ESTIMATOR';
  const isAdmin = role === 'ADMIN';

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleMarkAllRead = async () => {
    await fetch('/api/notifications', { method: 'PATCH' });
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const handleNotifClick = async (notif) => {
    if (!notif.isRead) {
      await fetch(`/api/notifications/${notif.id}`, { method: 'PATCH' });
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));
    }
    setShowNotifs(false);
    if (notif.project?.id) window.location.href = `/?projectId=${notif.project.id}`;
  };

  const handleLogout = () => {
    signOut({ redirect: false }).then(() => {
      window.location.href = '/login';
    });
  };

  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center justify-between" data-testid="app-header">
      <div className="flex items-center gap-3">
        <a href="/dashboard" data-testid="link-dashboard">
          <img src={COMPANY_LOGO} alt="Berger Iron Works" className="h-8 w-auto" />
        </a>
        <span className="text-xs text-gray-400">Steel Estimator</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="Toggle dark mode"
          aria-label="Toggle dark mode"
        >
          {mounted && (resolvedTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />)}
        </button>

        {/* Notification Bell */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifs(p => !p)}
            className="relative p-2 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Notifications"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifs && (
            <div className="absolute right-0 top-full mt-1 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Notifications</span>
                {unreadCount > 0 && (
                  <button onClick={handleMarkAllRead} className="text-xs text-blue-600 hover:underline">Mark all read</button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-center text-gray-400">No notifications</div>
                ) : notifications.map(n => (
                  <button key={n.id} onClick={() => handleNotifClick(n)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-50 dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${!n.isRead ? 'bg-blue-50 dark:bg-blue-950' : ''}`}>
                    <p className={`text-sm leading-snug ${!n.isRead ? 'font-medium text-gray-800 dark:text-gray-100' : 'text-gray-600 dark:text-gray-300'}`}>
                      {n.message}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{timeAgo(n.createdAt)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          data-testid="button-user-menu"
        >
          <div className="w-7 h-7 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-300">
            {(user.firstName?.[0] || user.email[0]).toUpperCase()}
          </div>
          <div className="text-right hidden sm:block">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{fullName}</div>
          </div>
          <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[role] || 'bg-gray-100 text-gray-700'}`} data-testid="text-user-role">
            {ROLE_LABELS[role] || role}
          </span>
          <ChevronDown size={14} className="text-gray-400" />
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50" data-testid="dropdown-user-menu">
            <div className="p-2 border-b border-gray-100 dark:border-gray-700">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{fullName}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{user.email}</div>
            </div>

            {isAdmin && (
              <a
                href="/admin"
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                data-testid="link-admin-panel"
              >
                <Shield size={14} />
                Admin Panel
              </a>
            )}

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors rounded-b-lg"
              data-testid="button-logout"
            >
              <LogOut size={14} />
              Sign Out
            </button>
          </div>
        )}
      </div>
      </div>
    </header>
  );
}
