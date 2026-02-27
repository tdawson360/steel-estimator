'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  ArrowLeft, Save, Plus, Trash2, Pencil, X, Check, Loader2,
  Phone, Mail, Star, Clock, Calendar,
} from 'lucide-react';
import AppHeader from '../../../components/AppHeader';

// ── HELPERS ──────────────────────────────────────────────────────────────────

function formatCurrency(value) {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  } catch { return '—'; }
}

function formatDateShort(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
}

function createdByName(u) {
  if (!u) return '';
  return `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Unknown';
}

const ACTIVITY_TYPE_BADGE = {
  NOTE:          'bg-gray-100 text-gray-600',
  CALL:          'bg-blue-100 text-blue-700',
  EMAIL:         'bg-indigo-100 text-indigo-700',
  MEETING:       'bg-green-100 text-green-700',
  BID_RECEIVED:  'bg-yellow-100 text-yellow-800',
  BID_SUBMITTED: 'bg-purple-100 text-purple-700',
  FOLLOW_UP:     'bg-amber-100 text-amber-700',
};

const ACTIVITY_TYPE_LABELS = {
  NOTE: 'Note', CALL: 'Call', EMAIL: 'Email', MEETING: 'Meeting',
  BID_RECEIVED: 'Bid Received', BID_SUBMITTED: 'Bid Submitted', FOLLOW_UP: 'Follow-Up',
};

const STATUS_BADGE = {
  'Bidding':                        'bg-blue-100 text-blue-700',
  'Quoted - Pending Award from GC': 'bg-yellow-100 text-yellow-800',
  'Quoted - Budget Only':           'bg-purple-100 text-purple-700',
  'Awarded to BIW':                 'bg-green-100 text-green-700',
  'Redesign omitted scope':         'bg-gray-100 text-gray-600',
};

const ESTIMATE_STATUS_BADGE = {
  DRAFT:     'bg-gray-100 text-gray-500',
  IN_REVIEW: 'bg-amber-100 text-amber-700',
  REOPENED:  'bg-purple-100 text-purple-700',
};

// ── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function CustomerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const customerId = parseInt(params.id);
  const { data: session } = useSession();

  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable company info
  const [info, setInfo] = useState({
    name: '', shortName: '', address: '', city: '', state: '', zip: '', phone: '', website: '', notes: '',
  });

  // Contacts
  const [contacts, setContacts] = useState([]);
  const [showAddContact, setShowAddContact] = useState(false);
  const [editingContactId, setEditingContactId] = useState(null);
  const [contactForm, setContactForm] = useState({
    firstName: '', lastName: '', title: '', email: '', phone: '', mobile: '', isPrimary: false,
  });

  // Activities
  const [activities, setActivities] = useState([]);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [activityForm, setActivityForm] = useState({
    type: 'NOTE', description: '', projectId: '', followUpDate: '',
  });

  // Projects
  const [projects, setProjects] = useState([]);

  // ── FETCH ──────────────────────────────────────────────────────────────────

  const fetchCustomer = useCallback(async () => {
    try {
      const res = await fetch(`/api/customers/${customerId}`);
      if (!res.ok) throw new Error('Not found');
      const data = await res.json();
      setCustomer(data);
      setInfo({
        name: data.name || '',
        shortName: data.shortName || '',
        address: data.address || '',
        city: data.city || '',
        state: data.state || '',
        zip: data.zip || '',
        phone: data.phone || '',
        website: data.website || '',
        notes: data.notes || '',
      });
      setContacts(data.contacts || []);
      setActivities(data.activities || []);
      setProjects(data.projects || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { fetchCustomer(); }, [fetchCustomer]);

  // ── COMPANY INFO SAVE ──────────────────────────────────────────────────────

  const handleSaveInfo = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(info),
      });
      if (res.ok) {
        const updated = await res.json();
        setCustomer(prev => ({ ...prev, ...updated }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // ── CONTACTS ───────────────────────────────────────────────────────────────

  const resetContactForm = () => {
    setContactForm({ firstName: '', lastName: '', title: '', email: '', phone: '', mobile: '', isPrimary: false });
  };

  const handleAddContact = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/customers/${customerId}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactForm),
      });
      if (res.ok) {
        setShowAddContact(false);
        resetContactForm();
        // Refetch contacts to get correct isPrimary state
        const cRes = await fetch(`/api/customers/${customerId}/contacts`);
        if (cRes.ok) setContacts(await cRes.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateContact = async (contactId) => {
    try {
      const res = await fetch(`/api/customers/${customerId}/contacts/${contactId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactForm),
      });
      if (res.ok) {
        setEditingContactId(null);
        resetContactForm();
        const cRes = await fetch(`/api/customers/${customerId}/contacts`);
        if (cRes.ok) setContacts(await cRes.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteContact = async (contactId) => {
    if (!confirm('Delete this contact?')) return;
    try {
      await fetch(`/api/customers/${customerId}/contacts/${contactId}`, { method: 'DELETE' });
      setContacts(prev => prev.filter(c => c.id !== contactId));
    } catch (err) {
      console.error(err);
    }
  };

  const startEditContact = (contact) => {
    setEditingContactId(contact.id);
    setContactForm({
      firstName: contact.firstName,
      lastName: contact.lastName,
      title: contact.title || '',
      email: contact.email || '',
      phone: contact.phone || '',
      mobile: contact.mobile || '',
      isPrimary: contact.isPrimary,
    });
  };

  // ── ACTIVITIES ─────────────────────────────────────────────────────────────

  const handleAddActivity = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        type: activityForm.type,
        description: activityForm.description,
        projectId: activityForm.projectId || null,
        followUpDate: activityForm.followUpDate || null,
      };
      const res = await fetch(`/api/customers/${customerId}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const activity = await res.json();
        setActivities(prev => [activity, ...prev]);
        setShowAddActivity(false);
        setActivityForm({ type: 'NOTE', description: '', projectId: '', followUpDate: '' });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkComplete = async (activityId) => {
    try {
      const res = await fetch(`/api/customers/${customerId}/activities/${activityId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markComplete: true }),
      });
      if (res.ok) {
        const updated = await res.json();
        setActivities(prev => prev.map(a => a.id === activityId ? updated : a));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteActivity = async (activityId) => {
    if (!confirm('Delete this activity?')) return;
    try {
      await fetch(`/api/customers/${customerId}/activities/${activityId}`, { method: 'DELETE' });
      setActivities(prev => prev.filter(a => a.id !== activityId));
    } catch (err) {
      console.error(err);
    }
  };

  // ── RENDER ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 py-16 text-center text-gray-400">
          <Loader2 size={24} className="animate-spin inline-block" />
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 py-16 text-center text-gray-400">Customer not found.</div>
      </div>
    );
  }

  const inputCls = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100";
  const labelCls = "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AppHeader />
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Back button + title */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.push('/customers')} className="p-1.5 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors">
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{customer.name}</h1>
        </div>

        {/* ── SECTION 1: Company Info + Contacts ─────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Company Info */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Company Info</h2>
              <button onClick={handleSaveInfo} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Company Name</label>
                  <input type="text" value={info.name} onChange={e => setInfo({ ...info, name: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Short Name</label>
                  <input type="text" value={info.shortName} onChange={e => setInfo({ ...info, shortName: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Address</label>
                <input type="text" value={info.address} onChange={e => setInfo({ ...info, address: e.target.value })} className={inputCls} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>City</label>
                  <input type="text" value={info.city} onChange={e => setInfo({ ...info, city: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>State</label>
                  <input type="text" value={info.state} onChange={e => setInfo({ ...info, state: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>ZIP</label>
                  <input type="text" value={info.zip} onChange={e => setInfo({ ...info, zip: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Phone</label>
                  <input type="tel" value={info.phone} onChange={e => setInfo({ ...info, phone: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Website</label>
                  <input type="text" value={info.website} onChange={e => setInfo({ ...info, website: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Notes</label>
                <textarea value={info.notes} onChange={e => setInfo({ ...info, notes: e.target.value })} rows={3} className={inputCls} />
              </div>
            </div>
          </div>

          {/* Contacts */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Contacts</h2>
              <button onClick={() => { setShowAddContact(true); resetContactForm(); }}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs font-medium">
                <Plus size={14} /> Add Contact
              </button>
            </div>

            {/* Add Contact Form (inline) */}
            {showAddContact && (
              <form onSubmit={handleAddContact} className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-md border border-gray-200 dark:border-gray-600">
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input type="text" required placeholder="First Name *" value={contactForm.firstName}
                    onChange={e => setContactForm({ ...contactForm, firstName: e.target.value })} className={inputCls} />
                  <input type="text" required placeholder="Last Name *" value={contactForm.lastName}
                    onChange={e => setContactForm({ ...contactForm, lastName: e.target.value })} className={inputCls} />
                </div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input type="text" placeholder="Title" value={contactForm.title}
                    onChange={e => setContactForm({ ...contactForm, title: e.target.value })} className={inputCls} />
                  <input type="email" placeholder="Email" value={contactForm.email}
                    onChange={e => setContactForm({ ...contactForm, email: e.target.value })} className={inputCls} />
                </div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input type="tel" placeholder="Phone" value={contactForm.phone}
                    onChange={e => setContactForm({ ...contactForm, phone: e.target.value })} className={inputCls} />
                  <input type="tel" placeholder="Mobile" value={contactForm.mobile}
                    onChange={e => setContactForm({ ...contactForm, mobile: e.target.value })} className={inputCls} />
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <input type="checkbox" checked={contactForm.isPrimary}
                      onChange={e => setContactForm({ ...contactForm, isPrimary: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    Primary Contact
                  </label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setShowAddContact(false)}
                      className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded">Cancel</button>
                    <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Save</button>
                  </div>
                </div>
              </form>
            )}

            {/* Contact List */}
            <div className="space-y-2">
              {contacts.length === 0 && !showAddContact && (
                <p className="text-sm text-gray-400 italic py-4 text-center">No contacts yet.</p>
              )}
              {contacts.map(contact => (
                <div key={contact.id} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-md border border-gray-100 dark:border-gray-600">
                  {editingContactId === contact.id ? (
                    // Editing inline
                    <div>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <input type="text" value={contactForm.firstName}
                          onChange={e => setContactForm({ ...contactForm, firstName: e.target.value })} className={inputCls} placeholder="First Name" />
                        <input type="text" value={contactForm.lastName}
                          onChange={e => setContactForm({ ...contactForm, lastName: e.target.value })} className={inputCls} placeholder="Last Name" />
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <input type="text" value={contactForm.title} placeholder="Title"
                          onChange={e => setContactForm({ ...contactForm, title: e.target.value })} className={inputCls} />
                        <input type="email" value={contactForm.email} placeholder="Email"
                          onChange={e => setContactForm({ ...contactForm, email: e.target.value })} className={inputCls} />
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <input type="tel" value={contactForm.phone} placeholder="Phone"
                          onChange={e => setContactForm({ ...contactForm, phone: e.target.value })} className={inputCls} />
                        <input type="tel" value={contactForm.mobile} placeholder="Mobile"
                          onChange={e => setContactForm({ ...contactForm, mobile: e.target.value })} className={inputCls} />
                      </div>
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <input type="checkbox" checked={contactForm.isPrimary}
                            onChange={e => setContactForm({ ...contactForm, isPrimary: e.target.checked })}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                          Primary
                        </label>
                        <div className="flex gap-2">
                          <button onClick={() => setEditingContactId(null)}
                            className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 rounded">Cancel</button>
                          <button onClick={() => handleUpdateContact(contact.id)}
                            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // Display mode
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                            {contact.firstName} {contact.lastName}
                          </span>
                          {contact.isPrimary && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">
                              <Star size={10} /> Primary
                            </span>
                          )}
                        </div>
                        {contact.title && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{contact.title}</p>}
                        <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                          {contact.email && (
                            <span className="flex items-center gap-1"><Mail size={11} /> {contact.email}</span>
                          )}
                          {contact.phone && (
                            <span className="flex items-center gap-1"><Phone size={11} /> {contact.phone}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => startEditContact(contact)}
                          className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded transition-colors">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDeleteContact(contact.id)}
                          className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── SECTION 2: Bid History ──────────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Bid History</h2>
          {projects.length === 0 ? (
            <p className="text-sm text-gray-400 italic text-center py-6">No projects linked to this customer yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-600">
                    <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-300 text-sm">Project Name</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-300 text-sm">Status</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600 dark:text-gray-300 text-sm">Estimate Total</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-300 text-sm">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map(p => {
                    const displayStatus = p.status === 'PUBLISHED' ? (p.dashboardStatus || 'Published') : p.status;
                    const badgeCls = STATUS_BADGE[displayStatus] || ESTIMATE_STATUS_BADGE[displayStatus] || 'bg-gray-100 text-gray-600';
                    const statusLabel = displayStatus === 'DRAFT' ? 'Draft' : displayStatus === 'IN_REVIEW' ? 'In Review' : displayStatus === 'REOPENED' ? 'Reopened' : displayStatus;
                    return (
                      <tr key={p.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <td className="px-4 py-2.5">
                          <a href={`/?projectId=${p.id}`} className="text-blue-600 hover:underline text-sm font-medium">
                            {p.projectName || 'Untitled'}
                          </a>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badgeCls}`}>
                            {statusLabel}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm text-gray-600 dark:text-gray-400 font-mono">
                          {formatCurrency(p.bidAmount)}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400">{formatDate(p.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── SECTION 3: Activity Timeline ────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Activity Timeline</h2>
            <button onClick={() => setShowAddActivity(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs font-medium">
              <Plus size={14} /> Add Activity
            </button>
          </div>

          {/* Add Activity Form */}
          {showAddActivity && (
            <form onSubmit={handleAddActivity} className="mb-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-md border border-gray-200 dark:border-gray-600">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className={labelCls}>Type</label>
                  <select value={activityForm.type} onChange={e => setActivityForm({ ...activityForm, type: e.target.value })} className={inputCls}>
                    {Object.entries(ACTIVITY_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Project (optional)</label>
                  <select value={activityForm.projectId} onChange={e => setActivityForm({ ...activityForm, projectId: e.target.value })} className={inputCls}>
                    <option value="">— None —</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.projectName || 'Untitled'}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mb-3">
                <label className={labelCls}>Description *</label>
                <textarea required value={activityForm.description} rows={2}
                  onChange={e => setActivityForm({ ...activityForm, description: e.target.value })} className={inputCls} />
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <label className={labelCls}>Follow-Up Date (optional)</label>
                  <input type="date" value={activityForm.followUpDate}
                    onChange={e => setActivityForm({ ...activityForm, followUpDate: e.target.value })} className={inputCls + ' w-auto'} />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowAddActivity(false)}
                    className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded">Cancel</button>
                  <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Save</button>
                </div>
              </div>
            </form>
          )}

          {/* Activity List */}
          <div className="space-y-3">
            {activities.length === 0 && !showAddActivity && (
              <p className="text-sm text-gray-400 italic text-center py-6">No activities yet.</p>
            )}
            {activities.map(a => {
              const hasPendingFollowUp = a.followUpDate && !a.completedAt;
              return (
                <div key={a.id} className={`p-3 rounded-md border ${hasPendingFollowUp ? 'border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30' : 'border-gray-100 dark:border-gray-600 bg-gray-50 dark:bg-gray-700'}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ACTIVITY_TYPE_BADGE[a.type] || 'bg-gray-100 text-gray-600'}`}>
                          {ACTIVITY_TYPE_LABELS[a.type] || a.type}
                        </span>
                        <span className="text-xs text-gray-400">{formatDateShort(a.activityDate)}</span>
                        {a.project && (
                          <a href={`/?projectId=${a.project.id}`} className="text-xs text-blue-600 hover:underline">
                            {a.project.projectName || 'Untitled'}
                          </a>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{a.description}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-xs text-gray-400">by {createdByName(a.createdBy)}</span>
                        {hasPendingFollowUp && (
                          <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                            <Clock size={11} /> Follow-up: {formatDateShort(a.followUpDate)}
                          </span>
                        )}
                        {a.completedAt && (
                          <span className="flex items-center gap-1 text-xs text-green-600">
                            <Check size={11} /> Completed {formatDateShort(a.completedAt)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      {hasPendingFollowUp && (
                        <button onClick={() => handleMarkComplete(a.id)} title="Mark Complete"
                          className="p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-950 rounded transition-colors">
                          <Check size={14} />
                        </button>
                      )}
                      <button onClick={() => handleDeleteActivity(a.id)} title="Delete"
                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
