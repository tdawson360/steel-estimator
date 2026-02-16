'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Plus, Trash2, FolderOpen, Search } from 'lucide-react';
import AppHeader from '../../components/AppHeader';

export default function ProjectsPage() {
  const { data: session } = useSession();
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await fetch(`/api/projects${params}`);
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProjects();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleCreate = async () => {
    try {
      const res = await fetch('/api/projects', { method: 'POST' });
      if (res.ok) {
        const project = await res.json();
        window.location.href = `/?projectId=${project.id}`;
      }
    } catch (err) {
      console.error('Failed to create project:', err);
    }
  };

  const handleOpen = (id) => {
    window.location.href = `/?projectId=${id}`;
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this project? This cannot be undone.')) return;
    try {
      setDeleting(id);
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setProjects(prev => prev.filter(p => p.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete project:', err);
    } finally {
      setDeleting(null);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  const userRole = session?.user?.role;
  const canCreate = userRole === 'ADMIN' || userRole === 'ESTIMATOR';
  const canDelete = userRole === 'ADMIN';

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Project Dashboard</h1>
          </div>
          {canCreate && (
            <button
              onClick={handleCreate}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
              data-testid="button-new-project"
            >
              <Plus size={16} />
              New Project
            </button>
          )}
        </div>

        <div className="mb-4 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by project name, customer, or architect..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            data-testid="input-search-projects"
          />
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">
              {search ? 'No projects match your search.' : 'No projects yet.'}
            </p>
            {!search && canCreate && (
              <button
                onClick={handleCreate}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
              >
                Create Your First Project
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Project Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Items</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr
                    key={project.id}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleOpen(project.id)}
                    data-testid={`row-project-${project.id}`}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {project.projectName || 'Untitled Project'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {project.customerName || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {project.estimateDate || formatDate(project.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        project.status === 'PUBLISHED' ? 'bg-green-100 text-green-700'
                        : project.status === 'IN_REVIEW' ? 'bg-amber-100 text-amber-700'
                        : project.status === 'REOPENED' ? 'bg-purple-100 text-purple-700'
                        : 'bg-gray-100 text-gray-700'
                      }`} data-testid={`status-badge-${project.id}`}>
                        {project.status === 'IN_REVIEW' ? 'In Review' : project.status === 'FIELD_SHOP' ? 'Field/Shop' : project.status.charAt(0) + project.status.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {project._count?.items || 0}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpen(project.id)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                          title="Open"
                          data-testid={`button-open-${project.id}`}
                        >
                          <FolderOpen size={16} />
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(project.id)}
                            disabled={deleting === project.id}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                            title="Delete"
                            data-testid={`button-delete-${project.id}`}
                          >
                            <Trash2 size={16} />
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
    </div>
  );
}
