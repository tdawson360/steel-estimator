'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { ChevronDown, LogOut, User, Settings, Shield } from 'lucide-react';

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

export default function AppHeader() {
  const { data: session } = useSession();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!session?.user) return null;

  const user = session.user;
  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
  const role = user.role || 'ESTIMATOR';
  const isAdmin = role === 'ADMIN';

  const handleLogout = () => {
    signOut({ callbackUrl: '/login' });
  };

  return (
    <header className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between" data-testid="app-header">
      <div className="flex items-center gap-3">
        <a href="/projects" className="text-lg font-bold text-gray-900 hover:text-blue-600 transition-colors" data-testid="link-dashboard">
          Berger Iron Works
        </a>
        <span className="text-xs text-gray-400">Steel Estimator</span>
      </div>
      
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
          data-testid="button-user-menu"
        >
          <div className="w-7 h-7 bg-gray-200 rounded-full flex items-center justify-center text-xs font-medium text-gray-600">
            {(user.firstName?.[0] || user.email[0]).toUpperCase()}
          </div>
          <div className="text-right hidden sm:block">
            <div className="text-sm font-medium text-gray-900">{fullName}</div>
          </div>
          <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[role] || 'bg-gray-100 text-gray-700'}`} data-testid="text-user-role">
            {ROLE_LABELS[role] || role}
          </span>
          <ChevronDown size={14} className="text-gray-400" />
        </button>
        
        {dropdownOpen && (
          <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50" data-testid="dropdown-user-menu">
            <div className="p-2 border-b border-gray-100">
              <div className="text-sm font-medium text-gray-900">{fullName}</div>
              <div className="text-xs text-gray-500">{user.email}</div>
            </div>
            
            {isAdmin && (
              <a
                href="/admin"
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                data-testid="link-admin-panel"
              >
                <Shield size={14} />
                Admin Panel
              </a>
            )}
            
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors rounded-b-lg"
              data-testid="button-logout"
            >
              <LogOut size={14} />
              Sign Out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
