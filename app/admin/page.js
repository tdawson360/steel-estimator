'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Plus, X, Shield, UserCheck, Eye, Wrench, Pencil, DollarSign } from 'lucide-react';
import Link from 'next/link';
import AppHeader from '../../components/AppHeader';

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Admin', icon: Shield, color: 'bg-red-100 text-red-700' },
  { value: 'ESTIMATOR', label: 'Estimator', icon: UserCheck, color: 'bg-blue-100 text-blue-700' },
  { value: 'PM', label: 'Project Manager', icon: Eye, color: 'bg-green-100 text-green-700' },
  { value: 'FIELD_SHOP', label: 'Field/Shop', icon: Wrench, color: 'bg-amber-100 text-amber-700' },
];

function getRoleColor(role) {
  return ROLE_OPTIONS.find(r => r.value === role)?.color || 'bg-gray-100 text-gray-700';
}
function getRoleLabel(role) {
  return ROLE_OPTIONS.find(r => r.value === role)?.label || role;
}

export default function AdminPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({ firstName: '', lastName: '', email: '', password: '', role: 'ESTIMATOR' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit modal state
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        setUsers(await res.json());
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create user');
        return;
      }
      setShowAddForm(false);
      setFormData({ firstName: '', lastName: '', email: '', password: '', role: 'ESTIMATOR' });
      fetchUsers();
    } catch (err) {
      setError('Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (user) => {
    const action = user.active ? 'deactivate' : 'reactivate';
    if (!confirm(`Are you sure you want to ${action} ${user.firstName} ${user.lastName}?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !user.active }),
      });
      if (res.ok) fetchUsers();
    } catch (err) {
      console.error('Failed to update user:', err);
    }
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setEditForm({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      password: '',
    });
    setEditError('');
  };

  const handleEditSave = async () => {
    setEditError('');
    setEditSaving(true);
    try {
      const payload = {
        firstName: editForm.firstName,
        lastName: editForm.lastName,
        email: editForm.email,
        role: editForm.role,
      };
      if (editForm.password) payload.password = editForm.password;

      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || 'Failed to update user');
        return;
      }
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      setEditError('Failed to update user');
    } finally {
      setEditSaving(false);
    }
  };

  const formatDate = (d) => {
    if (!d) return 'Never';
    return new Date(d).toLocaleDateString() + ' ' + new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (session?.user?.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <AppHeader />
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Access Denied</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">You do not have permission to access the Admin Panel.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AppHeader />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Admin Panel</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage users and roles</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/connection-pricing"
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm font-medium border border-gray-300 dark:border-gray-600"
            >
              <DollarSign size={16} />
              Global Pricing Data
            </Link>
            <button
              onClick={() => { setShowAddForm(true); setError(''); }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
              data-testid="button-add-user"
            >
              <Plus size={16} />
              Add User
            </button>
          </div>
        </div>

        {showAddForm && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Add New User</h2>
              <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X size={20} />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-400" data-testid="text-add-user-error">
                {error}
              </div>
            )}

            <form onSubmit={handleAdd}>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name</label>
                  <input
                    type="text" required value={formData.firstName}
                    onChange={(e) => setFormData(p => ({ ...p, firstName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100"
                    data-testid="input-first-name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
                  <input
                    type="text" required value={formData.lastName}
                    onChange={(e) => setFormData(p => ({ ...p, lastName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100"
                    data-testid="input-last-name"
                  />
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input
                  type="email" required value={formData.email}
                  onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100"
                  data-testid="input-user-email"
                />
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Temporary Password</label>
                  <input
                    type="text" required value={formData.password}
                    onChange={(e) => setFormData(p => ({ ...p, password: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100"
                    data-testid="input-user-password"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData(p => ({ ...p, role: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100"
                    data-testid="select-user-role"
                  >
                    {ROLE_OPTIONS.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit" disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
                  data-testid="button-save-user"
                >
                  {saving ? 'Creating...' : 'Create User'}
                </button>
                <button
                  type="button" onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">Loading users...</div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Role</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Last Login</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-gray-100 dark:border-gray-700" data-testid={`row-user-${user.id}`}>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                      {user.firstName} {user.lastName}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getRoleColor(user.role)}`}>
                        {getRoleLabel(user.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        user.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {user.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{formatDate(user.lastLoginAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(user)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                          title="Edit user"
                          data-testid={`button-edit-user-${user.id}`}
                        >
                          <Pencil size={14} />
                        </button>
                        {String(user.id) !== session?.user?.id && (
                          <button
                            onClick={() => handleToggleActive(user)}
                            className={`px-2 py-1 text-xs rounded ${
                              user.active ? 'text-amber-600 hover:bg-amber-50' : 'text-green-600 hover:bg-green-50'
                            }`}
                            data-testid={`button-toggle-active-${user.id}`}
                          >
                            {user.active ? 'Deactivate' : 'Activate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit User Modal */}
      {editingUser !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Edit User</h2>
              <button onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X size={20} />
              </button>
            </div>

            {editError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-400">
                {editError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name</label>
                <input
                  type="text" required value={editForm.firstName || ''}
                  onChange={(e) => setEditForm(p => ({ ...p, firstName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
                <input
                  type="text" required value={editForm.lastName || ''}
                  onChange={(e) => setEditForm(p => ({ ...p, lastName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <input
                type="email" required value={editForm.email || ''}
                onChange={(e) => setEditForm(p => ({ ...p, email: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
                <select
                  value={editForm.role || ''}
                  onChange={(e) => setEditForm(p => ({ ...p, role: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100"
                >
                  {ROLE_OPTIONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password</label>
                <input
                  type="text" value={editForm.password || ''}
                  onChange={(e) => setEditForm(p => ({ ...p, password: e.target.value }))}
                  placeholder="Leave blank to keep current"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleEditSave}
                disabled={editSaving}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
              >
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
