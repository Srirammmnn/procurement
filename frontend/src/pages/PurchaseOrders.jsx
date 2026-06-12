import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { PackageOpen, Star, X } from 'lucide-react';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api/v1';

export default function PurchaseOrders({ user }) {
  const navigate = useNavigate();
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Rating modal states
  const [showModal, setShowModal] = useState(false);
  const [selectedPo, setSelectedPo] = useState(null);
  const [deliveryScore, setDeliveryScore] = useState(5);
  const [qualityScore, setQualityScore] = useState(5);
  const [communicationScore, setCommunicationScore] = useState(5);
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // GRN Modal states
  const [showGrnModal, setShowGrnModal] = useState(false);
  const [grnForm, setGrnForm] = useState({
    delivery_date: new Date().toISOString().substring(0, 10),
    inspection_notes: '',
    items: []
  });

  // Amendment Modal states
  const [showAmendModal, setShowAmendModal] = useState(false);
  const [amendForm, setAmendForm] = useState({
    reason: '',
    expected_delivery_date: '',
    delivery_address: '',
    payment_terms: '',
    terms_conditions: '',
    items: []
  });

  // Amendment History Modal states
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const isProcurement = !user || ['procurement_officer', 'procurement_manager', 'administrator'].includes(user.role);
  const canReceiveGoods = !user || ['employee', 'procurement_officer', 'procurement_manager', 'administrator'].includes(user.role);
  const canApprove = user && ['procurement_manager', 'finance_officer', 'administrator'].includes(user.role);
  const canSubmitOrIssue = user && ['procurement_officer', 'procurement_manager', 'administrator'].includes(user.role);
  const canCancel = user && ['procurement_manager', 'administrator'].includes(user.role);
  const canAmend = user && ['procurement_officer', 'procurement_manager', 'administrator'].includes(user.role);
  const isAP = !user || ['accounts_payable', 'administrator'].includes(user.role);

  const fetchPOs = async () => {
    try {
      const res = await axios.get(`${API_URL}/purchase-orders/`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setPos(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPOs();
  }, []);

  const handleSubmitPo = async (id) => {
    try {
      await axios.post(`${API_URL}/purchase-orders/${id}/submit`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      alert('PO submitted for approval successfully!');
      fetchPOs();
    } catch (err) {
      alert('Failed to submit PO.');
    }
  };

  const handleApprovePo = async (id) => {
    try {
      await axios.post(`${API_URL}/purchase-orders/${id}/approve`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      alert('PO approved successfully!');
      fetchPOs();
    } catch (err) {
      alert('Failed to approve PO.');
    }
  };

  const handleIssuePo = async (id) => {
    try {
      const res = await axios.post(`${API_URL}/purchase-orders/${id}/issue`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.data.email_sent) {
        alert('PO issued and email sent to vendor successfully!');
      } else {
        alert('PO issued, but vendor email failed to send. Please check your SMTP settings in the Settings page.');
      }
      fetchPOs();
    } catch (err) {
      alert('Failed to issue PO.');
    }
  };

  const handleApproveAndIssuePo = async (id) => {
    try {
      // 1. Approve
      await axios.post(`${API_URL}/purchase-orders/${id}/approve`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      // 2. Issue
      const res = await axios.post(`${API_URL}/purchase-orders/${id}/issue`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.data.email_sent) {
        alert('PO approved, issued, and email sent to vendor successfully!');
      } else {
        alert('PO approved and issued, but vendor email failed to send. Please check your SMTP settings in the Settings page.');
      }
      fetchPOs();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to approve and issue PO.');
    }
  };

  const handleCancelPo = async (id) => {
    if (!window.confirm('Are you sure you want to cancel this Purchase Order?')) return;
    try {
      await axios.post(`${API_URL}/purchase-orders/${id}/cancel`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      alert('PO cancelled successfully!');
      fetchPOs();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to cancel PO.');
    }
  };

  const openAmendModal = (po) => {
    setSelectedPo(po);
    setAmendForm({
      reason: '',
      expected_delivery_date: po.expected_delivery_date ? po.expected_delivery_date.substring(0, 10) : '',
      delivery_address: po.delivery_address || '',
      payment_terms: po.payment_terms || '',
      terms_conditions: po.terms_conditions || '',
      items: po.items ? po.items.map(item => ({
        item_description: item.item_description,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price
      })) : []
    });
    setShowAmendModal(true);
  };

  const updateAmendItem = (index, field, value) => {
    const newItems = [...amendForm.items];
    newItems[index][field] = value;
    setAmendForm({ ...amendForm, items: newItems });
  };

  const addAmendItem = () => {
    setAmendForm({
      ...amendForm,
      items: [...amendForm.items, { item_description: '', quantity: 1, unit: 'pcs', unit_price: 0 }]
    });
  };

  const removeAmendItem = (index) => {
    const newItems = amendForm.items.filter((_, idx) => idx !== index);
    setAmendForm({ ...amendForm, items: newItems });
  };

  const handleAmendSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPo) return;
    setSubmitting(true);
    try {
      const payload = {
        reason: amendForm.reason,
        expected_delivery_date: amendForm.expected_delivery_date ? new Date(amendForm.expected_delivery_date).toISOString() : null,
        delivery_address: amendForm.delivery_address || null,
        payment_terms: amendForm.payment_terms || null,
        terms_conditions: amendForm.terms_conditions || null,
        items: amendForm.items.map(item => ({
          item_description: item.item_description,
          quantity: parseFloat(item.quantity) || 0,
          unit: item.unit || 'pcs',
          unit_price: parseFloat(item.unit_price) || 0
        }))
      };

      await axios.post(`${API_URL}/purchase-orders/${selectedPo.id}/amend`, payload, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      alert('PO amended successfully!');
      setShowAmendModal(false);
      fetchPOs();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.detail || 'Failed to amend PO.');
    } finally {
      setSubmitting(false);
    }
  };

  const openHistoryModal = (po) => {
    setSelectedPo(po);
    setShowHistoryModal(true);
  };

  const openRatingModal = (po) => {
    setSelectedPo(po);
    setDeliveryScore(5);
    setQualityScore(5);
    setCommunicationScore(5);
    setComments('');
    setShowModal(true);
  };

  const handleRateVendor = async (e) => {
    e.preventDefault();
    if (!selectedPo) return;
    setSubmitting(true);
    try {
      await axios.post(
        `${API_URL}/vendors/${selectedPo.vendor_id}/evaluate`,
        {
          po_id: selectedPo.id,
          delivery_score: deliveryScore,
          quality_score: qualityScore,
          communication_score: communicationScore,
          comments: comments
        },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }
      );
      alert('Vendor evaluation submitted successfully!');
      setShowModal(false);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.detail || 'Failed to submit evaluation.');
    } finally {
      setSubmitting(false);
    }
  };

  const openGrnModal = (po) => {
    setSelectedPo(po);
    setGrnForm({
      delivery_date: new Date().toISOString().substring(0, 10),
      inspection_notes: '',
      items: po.items.map(item => {
        const remaining = parseFloat(item.quantity) - parseFloat(item.received_quantity || 0);
        return {
          po_item_id: item.id,
          item_description: item.item_description,
          quantity: parseFloat(item.quantity),
          received_quantity: parseFloat(item.received_quantity || 0),
          quantity_received: remaining > 0 ? remaining : 0,
          quantity_accepted: remaining > 0 ? remaining : 0,
          quantity_rejected: 0,
          rejection_reason: ''
        };
      })
    });
    setShowGrnModal(true);
  };

  const updateGrnItem = (index, field, value) => {
    const newItems = [...grnForm.items];
    newItems[index][field] = value;
    
    if (field === 'quantity_received') {
      const val = parseFloat(value) || 0;
      newItems[index].quantity_accepted = val - (parseFloat(newItems[index].quantity_rejected) || 0);
    } else if (field === 'quantity_rejected') {
      const val = parseFloat(value) || 0;
      newItems[index].quantity_accepted = (parseFloat(newItems[index].quantity_received) || 0) - val;
    }
    
    setGrnForm({ ...grnForm, items: newItems });
  };

  const handleGrnSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPo) return;
    setSubmitting(true);
    try {
      const payload = {
        po_id: selectedPo.id,
        delivery_date: new Date(grnForm.delivery_date).toISOString(),
        inspection_notes: grnForm.inspection_notes,
        items: grnForm.items.map(item => ({
          po_item_id: item.po_item_id,
          item_description: item.item_description,
          quantity_received: parseFloat(item.quantity_received) || 0,
          quantity_accepted: parseFloat(item.quantity_accepted) || 0,
          quantity_rejected: parseFloat(item.quantity_rejected) || 0,
          rejection_reason: item.rejection_reason || null
        }))
      };

      await axios.post(`${API_URL}/grns/`, payload, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      alert('Goods Receipt Note (GRN) created successfully!');
      setShowGrnModal(false);
      fetchPOs();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.detail || 'Failed to create GRN.');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'draft': return 'pending';
      case 'pending_approval': return 'warning';
      case 'approved': return 'active';
      case 'issued': return 'success';
      case 'partially_delivered': return 'warning';
      case 'fully_delivered': return 'success';
      case 'cancelled': return 'danger';
      default: return 'pending';
    }
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Purchase Orders</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Track and manage purchase orders to vendors.</p>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '24px' }}>
        {loading ? (
          <div>Loading...</div>
        ) : (
          <div className="table-container" style={{ marginTop: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>PO Number</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Amendments</th>
                  <th>Date Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pos.length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No purchase orders found.</td></tr>
                ) : (
                  pos.map((po) => (
                    <tr key={po.id}>
                      <td style={{ fontWeight: 500 }}>{po.po_number}</td>
                      <td>${po.total_amount} {po.currency}</td>
                      <td>
                        <span className={`badge ${getStatusBadgeClass(po.status)}`}>{po.status}</span>
                        {!['draft', 'pending_approval', 'approved'].includes(po.status) && (
                          <div style={{ fontSize: '0.75rem', marginTop: '4px', color: po.vendor_email_sent ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                            {po.vendor_email_sent ? '📧 Email Sent' : '📧 Email Failed'}
                          </div>
                        )}
                      </td>
                      <td>
                        {po.amendment_count > 0 ? (
                          <span 
                            style={{ cursor: 'pointer', textDecoration: 'underline', color: 'var(--accent-primary)', fontWeight: 'bold' }}
                            onClick={() => openHistoryModal(po)}
                          >
                            {po.amendment_count}
                          </span>
                        ) : (
                          '0'
                        )}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{new Date(po.created_at).toLocaleDateString()}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {po.status === 'draft' && canSubmitOrIssue && (
                            <button
                              className="btn btn-outline"
                              style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                              onClick={() => handleSubmitPo(po.id)}
                            >
                              Submit
                            </button>
                          )}
                           {po.status === 'pending_approval' && canApprove && (
                            user && user.role === 'procurement_manager' ? (
                              <button
                                className="btn btn-primary"
                                style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                                onClick={() => handleApproveAndIssuePo(po.id)}
                              >
                                Approve & Issue
                              </button>
                            ) : (
                              <button
                                className="btn btn-primary"
                                style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                                onClick={() => handleApprovePo(po.id)}
                              >
                                Approve
                              </button>
                            )
                          )}
                          {po.status === 'approved' && canSubmitOrIssue && (
                            <button
                              className="btn btn-primary"
                              style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                              onClick={() => handleIssuePo(po.id)}
                            >
                              Issue PO
                            </button>
                          )}
                          {['approved', 'issued'].includes(po.status) && canAmend && (
                            <button
                              className="btn btn-outline"
                              style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                              onClick={() => openAmendModal(po)}
                            >
                              Amend
                            </button>
                          )}
                          {['issued', 'partially_delivered'].includes(po.status) && canReceiveGoods && (
                            <button
                              className="btn btn-primary"
                              style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                              onClick={() => openGrnModal(po)}
                            >
                              Receive Goods
                            </button>
                          )}
                          {['partially_delivered', 'fully_delivered'].includes(po.status) && isAP && (
                            <button
                              className="btn btn-primary"
                              style={{ padding: '4px 8px', fontSize: '0.8rem', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' }}
                              onClick={() => navigate('/invoices', { state: { poId: po.id } })}
                            >
                              Log Invoice
                            </button>
                          )}
                          {['issued', 'partially_delivered', 'fully_delivered'].includes(po.status) && isProcurement && (
                            <button
                              className="btn btn-outline"
                              style={{ padding: '4px 10px', fontSize: '0.8rem', display: 'inline-flex', gap: '4px' }}
                              onClick={() => openRatingModal(po)}
                            >
                              <Star size={12} fill="var(--accent-warning)" color="var(--accent-warning)" /> Rate Vendor
                            </button>
                          )}
                          {!['fully_delivered', 'closed', 'cancelled'].includes(po.status) && canCancel && (
                            <button
                              className="btn btn-outline"
                              style={{ padding: '4px 8px', fontSize: '0.8rem', color: 'var(--accent-danger)', borderColor: 'var(--accent-danger)' }}
                              onClick={() => handleCancelPo(po.id)}
                            >
                              Cancel
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

      {/* Evaluate Vendor Modal */}
      {showModal && selectedPo && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', padding: '32px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2>Evaluate Vendor</h2>
              <button className="btn btn-outline" style={{ padding: '8px' }} onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Rate the vendor's performance for Purchase Order <strong>{selectedPo.po_number}</strong>.
            </p>

            <form onSubmit={handleRateVendor} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Delivery Score</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setDeliveryScore(star)}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px' }}
                    >
                      <Star
                        size={28}
                        fill={star <= deliveryScore ? 'var(--accent-warning)' : 'transparent'}
                        color={star <= deliveryScore ? 'var(--accent-warning)' : 'var(--text-muted)'}
                        style={{ transition: 'transform 0.1s ease' }}
                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.2)'}
                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Quality Score</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setQualityScore(star)}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px' }}
                    >
                      <Star
                        size={28}
                        fill={star <= qualityScore ? 'var(--accent-warning)' : 'transparent'}
                        color={star <= qualityScore ? 'var(--accent-warning)' : 'var(--text-muted)'}
                        style={{ transition: 'transform 0.1s ease' }}
                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.2)'}
                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Communication Score</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setCommunicationScore(star)}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px' }}
                    >
                      <Star
                        size={28}
                        fill={star <= communicationScore ? 'var(--accent-warning)' : 'transparent'}
                        color={star <= communicationScore ? 'var(--accent-warning)' : 'var(--text-muted)'}
                        style={{ transition: 'transform 0.1s ease' }}
                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.2)'}
                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Review Comments</label>
                <textarea
                  className="input-field"
                  placeholder="Share feedback on vendor performance..."
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  style={{ minHeight: '100px', resize: 'vertical' }}
                  required
                />
              </div>

              <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)} disabled={submitting}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit Evaluation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log GRN Modal */}
      {showGrnModal && selectedPo && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '650px', padding: '32px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2>Log Goods Receipt Note (GRN)</h2>
              <button className="btn btn-outline" style={{ padding: '8px' }} onClick={() => setShowGrnModal(false)}><X size={20} /></button>
            </div>
            
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Confirm received quantities for PO <strong>{selectedPo.po_number}</strong>.
            </p>

            <form onSubmit={handleGrnSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label>Delivery Date</label>
                <input 
                  type="date" 
                  className="input-field" 
                  value={grnForm.delivery_date} 
                  onChange={e => setGrnForm({...grnForm, delivery_date: e.target.value})} 
                  required 
                />
              </div>

              <div className="form-group">
                <label>Inspection / Delivery Notes</label>
                <textarea 
                  className="input-field" 
                  placeholder="Enter details on shipment condition..."
                  value={grnForm.inspection_notes} 
                  onChange={e => setGrnForm({...grnForm, inspection_notes: e.target.value})} 
                  style={{ minHeight: '80px', resize: 'vertical' }}
                />
              </div>

              <div style={{ marginTop: '12px' }}>
                <h3 style={{ marginBottom: '8px' }}>Received Items</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {grnForm.items.map((item, idx) => (
                    <div key={idx} className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.02)' }}>
                      <div style={{ fontWeight: 500, marginBottom: '8px' }}>{item.item_description}</div>
                      <div style={{ display: 'flex', gap: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                        <span>Ordered: {item.quantity}</span>
                        <span>Already Received: {item.received_quantity}</span>
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                        <div className="form-group">
                          <label style={{ fontSize: '0.8rem' }}>Qty Received</label>
                          <input 
                            type="number" 
                            className="input-field"
                            style={{ padding: '6px 10px' }}
                            value={item.quantity_received} 
                            onChange={e => updateGrnItem(idx, 'quantity_received', e.target.value)} 
                            required 
                          />
                        </div>
                        <div className="form-group">
                          <label style={{ fontSize: '0.8rem' }}>Qty Accepted</label>
                          <input 
                            type="number" 
                            className="input-field"
                            style={{ padding: '6px 10px' }}
                            value={item.quantity_accepted} 
                            onChange={e => updateGrnItem(idx, 'quantity_accepted', e.target.value)} 
                            required 
                          />
                        </div>
                        <div className="form-group">
                          <label style={{ fontSize: '0.8rem' }}>Qty Rejected</label>
                          <input 
                            type="number" 
                            className="input-field"
                            style={{ padding: '6px 10px' }}
                            value={item.quantity_rejected} 
                            onChange={e => updateGrnItem(idx, 'quantity_rejected', e.target.value)} 
                            required 
                          />
                        </div>
                      </div>

                      {parseFloat(item.quantity_rejected) > 0 && (
                        <div className="form-group" style={{ marginTop: '8px' }}>
                          <label style={{ fontSize: '0.8rem' }}>Rejection Reason</label>
                          <input 
                            className="input-field"
                            style={{ padding: '6px 10px' }}
                            placeholder="Why were these items rejected?"
                            value={item.rejection_reason} 
                            onChange={e => updateGrnItem(idx, 'rejection_reason', e.target.value)} 
                            required 
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowGrnModal(false)} disabled={submitting}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Creating GRN...' : 'Log Goods Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Amend PO Modal */}
      {showAmendModal && selectedPo && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '700px', padding: '32px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2>Amend Purchase Order {selectedPo.po_number}</h2>
              <button className="btn btn-outline" style={{ padding: '8px' }} onClick={() => setShowAmendModal(false)}><X size={20} /></button>
            </div>
            
            <form onSubmit={handleAmendSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label>Amendment Reason *</label>
                <textarea 
                  className="input-field" 
                  placeholder="Explain why you are amending this Purchase Order..."
                  value={amendForm.reason} 
                  onChange={e => setAmendForm({...amendForm, reason: e.target.value})} 
                  style={{ minHeight: '80px', resize: 'vertical' }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label>Expected Delivery Date</label>
                  <input 
                    type="date" 
                    className="input-field" 
                    value={amendForm.expected_delivery_date} 
                    onChange={e => setAmendForm({...amendForm, expected_delivery_date: e.target.value})} 
                  />
                </div>
                <div className="form-group">
                  <label>Payment Terms</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="e.g. Net 30"
                    value={amendForm.payment_terms} 
                    onChange={e => setAmendForm({...amendForm, payment_terms: e.target.value})} 
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Delivery Address</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={amendForm.delivery_address} 
                  onChange={e => setAmendForm({...amendForm, delivery_address: e.target.value})} 
                />
              </div>

              <div className="form-group">
                <label>Terms & Conditions</label>
                <textarea 
                  className="input-field" 
                  value={amendForm.terms_conditions} 
                  onChange={e => setAmendForm({...amendForm, terms_conditions: e.target.value})} 
                  style={{ minHeight: '60px', resize: 'vertical' }}
                />
              </div>

              <div style={{ marginTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3>Items List</h3>
                  <button type="button" className="btn btn-outline" style={{ padding: '6px 12px', fontSize: '0.85rem' }} onClick={addAmendItem}>
                    + Add Item
                  </button>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {amendForm.items.map((item, idx) => (
                    <div key={idx} className="glass-panel" style={{ padding: '16px', background: 'rgba(255,255,255,0.01)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>Item #{idx + 1}</span>
                        {amendForm.items.length > 1 && (
                          <button type="button" className="btn btn-outline" style={{ padding: '4px 8px', fontSize: '0.8rem', color: 'var(--accent-danger)', borderColor: 'var(--accent-danger)' }} onClick={() => removeAmendItem(idx)}>
                            Remove
                          </button>
                        )}
                      </div>

                      <div className="form-group">
                        <label style={{ fontSize: '0.8rem' }}>Description *</label>
                        <input 
                          type="text" 
                          className="input-field" 
                          style={{ padding: '8px 12px' }}
                          value={item.item_description} 
                          onChange={e => updateAmendItem(idx, 'item_description', e.target.value)} 
                          required 
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                        <div className="form-group">
                          <label style={{ fontSize: '0.8rem' }}>Quantity *</label>
                          <input 
                            type="number" 
                            className="input-field"
                            style={{ padding: '8px 12px' }}
                            value={item.quantity} 
                            onChange={e => updateAmendItem(idx, 'quantity', e.target.value)} 
                            required 
                          />
                        </div>
                        <div className="form-group">
                          <label style={{ fontSize: '0.8rem' }}>Unit *</label>
                          <input 
                            type="text" 
                            className="input-field"
                            style={{ padding: '8px 12px' }}
                            value={item.unit} 
                            onChange={e => updateAmendItem(idx, 'unit', e.target.value)} 
                            required 
                          />
                        </div>
                        <div className="form-group">
                          <label style={{ fontSize: '0.8rem' }}>Unit Price ($) *</label>
                          <input 
                            type="number" 
                            step="0.01"
                            className="input-field"
                            style={{ padding: '8px 12px' }}
                            value={item.unit_price} 
                            onChange={e => updateAmendItem(idx, 'unit_price', e.target.value)} 
                            required 
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowAmendModal(false)} disabled={submitting}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Applying Amendment...' : 'Apply Amendment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Amendment History Modal */}
      {showHistoryModal && selectedPo && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '650px', padding: '32px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2>Amendment History — PO {selectedPo.po_number}</h2>
              <button className="btn btn-outline" style={{ padding: '8px' }} onClick={() => setShowHistoryModal(false)}><X size={20} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {(!selectedPo.amendments || selectedPo.amendments.length === 0) ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No amendment history records found.</div>
              ) : (
                selectedPo.amendments.map((amendment) => (
                  <div key={amendment.id} className="glass-panel" style={{ padding: '20px', background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px', marginBottom: '12px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>Amendment #{amendment.amendment_number}</span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {new Date(amendment.created_at).toLocaleString()}
                      </span>
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Reason for Amendment:</strong>
                      <p style={{ marginTop: '4px', background: 'rgba(0, 0, 0, 0.2)', padding: '10px', borderRadius: '8px' }}>
                        {amendment.reason}
                      </p>
                    </div>

                    <div>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Changes Made:</strong>
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {amendment.changes_snapshot && Object.keys(amendment.changes_snapshot).length > 0 ? (
                          Object.entries(amendment.changes_snapshot).map(([key, change]) => {
                            if (key === 'items') {
                              return (
                                <div key={key} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                                  <span style={{ fontWeight: 500 }}>Items changed:</span>
                                  <div style={{ paddingLeft: '12px', marginTop: '4px', fontSize: '0.85rem' }}>
                                    <div style={{ color: 'var(--accent-danger)' }}><strong>Old Items:</strong> {change.old.map(i => `${i.item_description} (${i.quantity} ${i.unit} @ $${i.unit_price})`).join(', ')}</div>
                                    <div style={{ color: 'var(--accent-success)' }}><strong>New Items:</strong> {change.new.map(i => `${i.item_description} (${i.quantity} ${i.unit} @ $${i.unit_price})`).join(', ')}</div>
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px', fontSize: '0.85rem' }}>
                                <span style={{ textTransform: 'capitalize', color: 'var(--text-secondary)' }}>{key.replace(/_/g, ' ')}:</span>
                                <span>
                                  <span style={{ color: 'var(--accent-danger)', textDecoration: 'line-through', marginRight: '8px' }}>
                                    {key.includes('date') && change.old ? new Date(change.old).toLocaleDateString() : String(change.old)}
                                  </span>
                                  <span style={{ color: 'var(--accent-success)' }}>
                                    {key.includes('date') && change.new ? new Date(change.new).toLocaleDateString() : String(change.new)}
                                  </span>
                                </span>
                              </div>
                            );
                          })
                        ) : (
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No detailed attribute changes recorded.</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setShowHistoryModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
