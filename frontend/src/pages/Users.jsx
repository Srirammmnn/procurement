import { useState, useEffect } from 'react';
import axios from 'axios';
import { Users as UsersIcon, Plus, Search, Trash2, Edit, UserCheck, UserX } from 'lucide-react';

const API_URL = import.meta.env.PROD ? '/api/v1' : 'http://localhost:8000/api/v1';

export default function Users({ user }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'employee',
    department: ''
  });

  const isAdmin = user && user.role?.toLowerCase() === 'administrator';

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/users/`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setUsers(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      await axios.post(`${API_URL}/users/`, formData, { headers });
      alert('User added successfully.');
      setShowAddModal(false);
      setFormData({ full_name: '', email: '', password: '', role: 'employee', department: '' });
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to add user.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (userId, currentState) => {
    if (!window.confirm(`Are you sure you want to ${currentState ? 'deactivate' : 'activate'} this user?`)) return;
    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      await axios.patch(`${API_URL}/users/${userId}`, { is_active: !currentState }, { headers });
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update user status.');
    }
  };
  
  const handleDeleteUser = async (userId) => {
    if (!window.confirm(`Are you sure you want to deactivate (remove) this user?`)) return;
    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      await axios.delete(`${API_URL}/users/${userId}`, { headers });
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to remove user.');
    }
  };

  const filteredUsers = users.filter(u => 
    u.full_name.toLowerCase().includes(search.toLowerCase()) || 
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-in" style={{ padding: '20px max(24px, 4vw)', maxWidth: '1400px', margin: '0 auto' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 800 }}>User Management</h1>
          <p style={{ color: 'var(--text-muted)' }}>Manage system users and their roles.</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <Plus size={18} /> Add New User
          </button>
        )}
      </div>

      <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
        <div style={{ position: 'relative', maxWidth: '400px' }}>
          <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="input-field"
            placeholder="Search users by name or email..."
            style={{ paddingLeft: '44px' }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading users...</div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>User Details</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Status</th>
                  {isAdmin && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 5 : 4} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      <UsersIcon size={40} style={{ opacity: 0.2, marginBottom: '16px' }} />
                      <div>No users found matching your criteria.</div>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{u.full_name}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{u.email}</div>
                      </td>
                      <td>
                        <span className="badge pending" style={{ textTransform: 'capitalize' }}>
                          {u.role.replace('_', ' ')}
                        </span>
                      </td>
                      <td>{u.department || 'N/A'}</td>
                      <td>
                        <span className={`badge ${u.is_active ? 'active' : 'inactive'}`}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      {isAdmin && (
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button 
                              className="btn btn-outline" 
                              style={{ padding: '6px', color: u.is_active ? 'var(--accent-warning)' : 'var(--accent-success)', borderColor: u.is_active ? 'var(--accent-warning)' : 'var(--accent-success)' }}
                              title={u.is_active ? 'Deactivate' : 'Activate'}
                              onClick={() => handleToggleActive(u.id, u.is_active)}
                            >
                              {u.is_active ? <UserX size={16} /> : <UserCheck size={16} />}
                            </button>
                            <button 
                              className="btn btn-outline" 
                              style={{ padding: '6px', color: 'var(--accent-danger)', borderColor: 'var(--accent-danger)' }}
                              title="Remove"
                              onClick={() => handleDeleteUser(u.id)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', padding: '32px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <UsersIcon size={24} color="var(--accent-primary)" />
              Add New User
            </h2>
            
            <form onSubmit={handleAddUser} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Full Name *</label>
                <input required type="text" name="full_name" value={formData.full_name} onChange={handleInputChange} className="input-field" placeholder="Jane Doe" />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Email *</label>
                <input required type="email" name="email" value={formData.email} onChange={handleInputChange} className="input-field" placeholder="jane@example.com" />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Password *</label>
                <input required type="password" name="password" value={formData.password} onChange={handleInputChange} className="input-field" placeholder="Temporary password" minLength={6} />
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Role</label>
                  <select name="role" value={formData.role} onChange={handleInputChange} className="input-field" style={{ backgroundColor: 'var(--glass-bg)' }}>
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    <option value="procurement_officer">Procurement Officer</option>
                    <option value="procurement_manager">Procurement Manager</option>
                    <option value="finance_officer">Finance Officer</option>
                    <option value="accounts_payable">Accounts Payable</option>
                    <option value="auditor">Auditor</option>
                    <option value="administrator">Administrator</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Department</label>
                  <input type="text" name="department" value={formData.department} onChange={handleInputChange} className="input-field" placeholder="e.g. IT" />
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '12px', marginTop: '16px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Add User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
