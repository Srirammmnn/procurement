import { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, X, ShoppingCart } from 'lucide-react';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api/v1';

export default function Requisitions({ user }) {
  const [reqs, setReqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    department: user.department || 'Engineering',
    budget_code: 'ENG-2026',
    justification: '',
    items: [{ item_description: '', quantity: 1, unit: 'pcs', estimated_unit_price: 0 }]
  });

  // Convert to PO modal states
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [selectedReq, setSelectedReq] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [poForm, setPoForm] = useState({
    vendor_id: '',
    delivery_address: 'Main Office',
    expected_delivery_date: '',
    payment_terms: 'Net 30',
    terms_conditions: 'Standard commercial terms apply.',
  });

  const isProcurement = user && ['procurement_officer', 'procurement_manager', 'administrator'].includes(user.role);

  const fetchReqs = async () => {
    try {
      const res = await axios.get(`${API_URL}/requisitions/`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setReqs(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReqs();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        items: formData.items.map(item => ({
          ...item,
          quantity: parseFloat(item.quantity),
          estimated_unit_price: parseFloat(item.estimated_unit_price)
        }))
      };
      await axios.post(`${API_URL}/requisitions/`, payload, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setShowModal(false);
      fetchReqs();
    } catch (err) {
      alert('Failed to create requisition. Ensure budget code is valid.');
    }
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { item_description: '', quantity: 1, unit: 'pcs', estimated_unit_price: 0 }]
    });
  };

  const updateItem = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = value;
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmitReq = async (id) => {
    try {
      await axios.post(`${API_URL}/requisitions/${id}/submit`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      fetchReqs();
    } catch (err) {
      alert('Failed to submit requisition.');
    }
  };

  const openConvertModal = async (req) => {
    setSelectedReq(req);
    try {
      const res = await axios.get(`${API_URL}/vendors/`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setVendors(res.data);
      if (res.data.length > 0) {
        setPoForm(prev => ({ ...prev, vendor_id: res.data[0].id }));
      }
    } catch (err) {
      console.error("Failed to fetch vendors:", err);
    }
    setShowConvertModal(true);
  };

  const handleConvertSubmit = async (e) => {
    e.preventDefault();
    if (!selectedReq) return;
    try {
      const payload = {
        requisition_id: selectedReq.id,
        vendor_id: parseInt(poForm.vendor_id),
        total_amount: selectedReq.total_estimated_value,
        currency: "USD",
        delivery_address: poForm.delivery_address,
        expected_delivery_date: poForm.expected_delivery_date ? new Date(poForm.expected_delivery_date).toISOString() : null,
        payment_terms: poForm.payment_terms,
        terms_conditions: poForm.terms_conditions,
        items: selectedReq.items.map(item => ({
          item_description: item.item_description,
          quantity: item.quantity,
          unit: item.unit || 'pcs',
          unit_price: item.estimated_unit_price,
        }))
      };
      
      await axios.post(`${API_URL}/purchase-orders/`, payload, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      alert('Requisition converted to Purchase Order successfully!');
      setShowConvertModal(false);
      fetchReqs();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.detail || 'Failed to convert requisition to PO.');
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'draft': return 'pending';
      case 'pending_approval': return 'warning';
      case 'approved': return 'active';
      case 'converted_to_po': return 'success';
      case 'rejected': return 'danger';
      default: return 'pending';
    }
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Purchase Requisitions</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Manage and track your procurement requests.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={18} /> New Requisition
        </button>
      </div>

      <div className="glass-panel" style={{ padding: '24px' }}>
        {loading ? (
          <div>Loading...</div>
        ) : (
          <div className="table-container" style={{ marginTop: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>PR Number</th>
                  <th>Department</th>
                  <th>Estimated Value</th>
                  <th>Status</th>
                  <th>Date Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {reqs.length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No requisitions found.</td></tr>
                ) : (
                  reqs.map((req) => (
                    <tr key={req.id}>
                      <td style={{ fontWeight: 500 }}>{req.pr_number}</td>
                      <td>{req.department}</td>
                      <td>${req.total_estimated_value || '0.00'}</td>
                      <td><span className={`badge ${getStatusBadgeClass(req.status)}`}>{req.status}</span></td>
                      <td style={{ color: 'var(--text-secondary)' }}>{new Date(req.created_at).toLocaleDateString()}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {req.status === 'draft' && (
                            <button 
                              className="btn btn-outline" 
                              style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                              onClick={() => handleSubmitReq(req.id)}
                            >
                              Submit
                            </button>
                          )}
                          {req.status === 'approved' && isProcurement && (
                            <button 
                              className="btn btn-primary" 
                              style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                              onClick={() => openConvertModal(req)}
                            >
                              Convert to PO
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', padding: '32px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2>Create Requisition</h2>
              <button className="btn btn-outline" style={{ padding: '8px' }} onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label>Department</label>
                <input className="input-field" value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>Budget Code</label>
                <input className="input-field" value={formData.budget_code} onChange={e => setFormData({...formData, budget_code: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>Justification</label>
                <textarea className="input-field" value={formData.justification} onChange={e => setFormData({...formData, justification: e.target.value})} />
              </div>
              
              <div style={{ marginTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <h3>Items</h3>
                  <button type="button" className="btn btn-outline" onClick={addItem} style={{ padding: '4px 12px', fontSize: '0.8rem' }}>+ Add Item</button>
                </div>
                {formData.items.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                    <input className="input-field" placeholder="Description" value={item.item_description} onChange={e => updateItem(idx, 'item_description', e.target.value)} required />
                    <input type="number" className="input-field" style={{ width: '80px' }} placeholder="Qty" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} required />
                    <input type="number" step="0.01" className="input-field" style={{ width: '100px' }} placeholder="Price" value={item.estimated_unit_price} onChange={e => updateItem(idx, 'estimated_unit_price', e.target.value)} required />
                  </div>
                ))}
              </div>

              <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Draft</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showConvertModal && selectedReq && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', padding: '32px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2>Convert Requisition {selectedReq.pr_number} to PO</h2>
              <button className="btn btn-outline" style={{ padding: '8px' }} onClick={() => setShowConvertModal(false)}><X size={20} /></button>
            </div>
            
            <form onSubmit={handleConvertSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label>Select Vendor</label>
                <select 
                  className="input-field" 
                  value={poForm.vendor_id} 
                  onChange={e => setPoForm({...poForm, vendor_id: e.target.value})} 
                  required
                >
                  <option value="">-- Choose Vendor --</option>
                  {vendors.map(v => (
                    <option key={v.id} value={v.id}>{v.company_name} ({v.vendor_code})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Delivery Address</label>
                <input 
                  className="input-field" 
                  value={poForm.delivery_address} 
                  onChange={e => setPoForm({...poForm, delivery_address: e.target.value})} 
                  required 
                />
              </div>

              <div className="form-group">
                <label>Expected Delivery Date</label>
                <input 
                  type="date" 
                  className="input-field" 
                  value={poForm.expected_delivery_date} 
                  onChange={e => setPoForm({...poForm, expected_delivery_date: e.target.value})} 
                />
              </div>

              <div className="form-group">
                <label>Payment Terms</label>
                <input 
                  className="input-field" 
                  value={poForm.payment_terms} 
                  onChange={e => setPoForm({...poForm, payment_terms: e.target.value})} 
                  required 
                />
              </div>

              <div className="form-group">
                <label>Terms & Conditions</label>
                <textarea 
                  className="input-field" 
                  value={poForm.terms_conditions} 
                  onChange={e => setPoForm({...poForm, terms_conditions: e.target.value})} 
                />
              </div>

              <div style={{ marginTop: '16px' }}>
                <h3>Items to Order</h3>
                <div style={{ maxHeight: '150px', overflowY: 'auto', marginTop: '8px', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '8px' }}>
                  {selectedReq.items.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <div>
                        <div style={{ fontWeight: 500 }}>{item.item_description}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Qty: {item.quantity} {item.unit || 'pcs'}</div>
                      </div>
                      <div style={{ fontWeight: 600 }}>${(parseFloat(item.quantity) * parseFloat(item.estimated_unit_price)).toFixed(2)}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', padding: '0 8px', fontWeight: 700 }}>
                  <span>Total Value:</span>
                  <span>${selectedReq.total_estimated_value}</span>
                </div>
              </div>

              <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowConvertModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Convert & Create PO</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
