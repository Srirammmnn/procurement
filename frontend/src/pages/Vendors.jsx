import { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Search, CheckCircle, XCircle, Trash2, Building2, AlertTriangle, ShieldAlert } from 'lucide-react';

const API_URL = import.meta.env.PROD ? '/api/v1' : 'http://localhost:8000/api/v1';

export default function Vendors({ user }) {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    company_name: '',
    email: '',
    phone: '',
    category: '',
    country: '',
    address: '',
    contact_person: ''
  });

  const isAdmin = user && user.role?.toLowerCase() === 'administrator';
  const isAdminOrManager = user && ['administrator', 'procurement_manager', 'procurement_officer'].includes(user.role?.toLowerCase());

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/vendors/`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setVendors(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAddVendor = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      await axios.post(`${API_URL}/vendors/`, formData, { headers });
      alert('Vendor added successfully.');
      setShowAddModal(false);
      setFormData({ company_name: '', email: '', phone: '', category: '', country: '', address: '', contact_person: '' });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to add vendor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusAction = async (vendorId, action, reason = '') => {
    if (!window.confirm(`Are you sure you want to ${action} this vendor?`)) return;
    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      if (action === 'delete') {
        await axios.delete(`${API_URL}/vendors/${vendorId}`, { headers });
      } else if (action === 'blacklist') {
        const blReason = prompt("Enter reason for blacklisting:");
        if (!blReason) return;
        await axios.post(`${API_URL}/vendors/${vendorId}/blacklist?reason=${encodeURIComponent(blReason)}`, {}, { headers });
      } else if (action === 'approve') {
        await axios.post(`${API_URL}/vendors/${vendorId}/approve`, {}, { headers });
      }
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || `Failed to ${action} vendor.`);
    }
  };

  const filteredVendors = vendors.filter(v => 
    v.company_name.toLowerCase().includes(search.toLowerCase()) || 
    v.vendor_code.toLowerCase().includes(search.toLowerCase()) ||
    v.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-in" style={{ padding: '20px max(24px, 4vw)', maxWidth: '1400px', margin: '0 auto' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 800 }}>Vendor Management</h1>
          <p style={{ color: 'var(--text-muted)' }}>Add, evaluate, and manage supplier relations.</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <Plus size={18} /> Add New Vendor
          </button>
        )}
      </div>

      <div className="glass-panel" style={{ padding: '20px', marginBottom: '24px' }}>
        <div style={{ position: 'relative', maxWidth: '400px' }}>
          <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="input-field"
            placeholder="Search vendors by name, code, or email..."
            style={{ paddingLeft: '44px' }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading vendors...</div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Vendor Code</th>
                  <th>Company Info</th>
                  <th>Category</th>
                  <th>Status</th>
                  {isAdminOrManager && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredVendors.length === 0 ? (
                  <tr>
                    <td colSpan={isAdminOrManager ? 5 : 4} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      <Building2 size={40} style={{ opacity: 0.2, marginBottom: '16px' }} />
                      <div>No vendors found matching your criteria.</div>
                    </td>
                  </tr>
                ) : (
                  filteredVendors.map((v) => (
                    <tr key={v.id}>
                      <td style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>{v.vendor_code}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{v.company_name}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{v.email} | {v.phone}</div>
                      </td>
                      <td>{v.category || 'N/A'}</td>
                      <td>
                        <span className={`badge ${
                          v.status === 'active' ? 'success' : 
                          v.status === 'pending' ? 'pending' : 
                          v.status === 'blacklisted' ? 'danger' : 'warning'
                        }`}>
                          {v.status.toUpperCase()}
                        </span>
                      </td>
                      {isAdminOrManager && (
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            {v.status === 'pending' && (
                              <button 
                                className="btn btn-outline" 
                                style={{ padding: '6px', color: 'var(--accent-success)', borderColor: 'var(--accent-success)' }}
                                title="Approve"
                                onClick={() => handleStatusAction(v.id, 'approve')}
                              >
                                <CheckCircle size={16} />
                              </button>
                            )}
                            {v.status !== 'blacklisted' && (
                              <button 
                                className="btn btn-outline" 
                                style={{ padding: '6px', color: 'var(--accent-warning)', borderColor: 'var(--accent-warning)' }}
                                title="Blacklist"
                                onClick={() => handleStatusAction(v.id, 'blacklist')}
                              >
                                <ShieldAlert size={16} />
                              </button>
                            )}
                            {isAdmin && (
                              <button 
                                className="btn btn-outline" 
                                style={{ padding: '6px', color: 'var(--accent-danger)', borderColor: 'var(--accent-danger)' }}
                                title="Delete"
                                onClick={() => handleStatusAction(v.id, 'delete')}
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
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

      {/* Add Vendor Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', padding: '32px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Building2 size={24} color="var(--accent-primary)" />
              Add New Vendor
            </h2>
            
            <form onSubmit={handleAddVendor} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Company Name *</label>
                <input required type="text" name="company_name" value={formData.company_name} onChange={handleInputChange} className="input-field" placeholder="Acme Corp" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Email *</label>
                  <input required type="email" name="email" value={formData.email} onChange={handleInputChange} className="input-field" placeholder="sales@acme.com" />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Phone</label>
                  <input type="text" name="phone" value={formData.phone} onChange={handleInputChange} className="input-field" placeholder="+1 234 567 890" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Category</label>
                  <input type="text" name="category" value={formData.category} onChange={handleInputChange} className="input-field" placeholder="e.g. IT Hardware" />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Country</label>
                  <input type="text" name="country" value={formData.country} onChange={handleInputChange} className="input-field" placeholder="e.g. USA" />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Contact Person</label>
                <input type="text" name="contact_person" value={formData.contact_person} onChange={handleInputChange} className="input-field" placeholder="John Doe" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Address</label>
                <textarea name="address" value={formData.address} onChange={handleInputChange} className="input-field" style={{ resize: 'vertical', minHeight: '80px' }} placeholder="123 Corporate Blvd..."></textarea>
              </div>
              
              <div style={{ display: 'flex', gap: '12px', marginTop: '16px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Add Vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
