import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Plus, Send, CheckCircle, TrendingUp, User, 
  Clock, Building2, DollarSign, AlertCircle, Calendar, FileText, Check
} from 'lucide-react';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api/v1';

export default function RFQs({ user }) {
  const [rfqs, setRfqs] = useState([]);
  const [selectedRfq, setSelectedRfq] = useState(null);
  const [quotations, setQuotations] = useState([]);
  const [comparison, setComparison] = useState(null);
  const [requisitions, setRequisitions] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [selectedRequisitionDetails, setSelectedRequisitionDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBidModal, setShowBidModal] = useState(false);

  // New RFQ Form state
  const [newRfq, setNewRfq] = useState({
    requisition_id: '',
    title: '',
    description: '',
    submission_deadline: '',
    terms_conditions: '',
    vendor_ids: []
  });

  // New Bid Form state
  const [newBid, setNewBid] = useState({
    vendor_id: '',
    delivery_days: 5,
    validity_date: '',
    notes: '',
    items: []
  });

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };
  
  const isVendor = user && user.role.toLowerCase() === 'vendor';
  const myVendorProfile = vendors.find(v => v.email === user?.email);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch RFQs
      const res = await axios.get(`${API_URL}/rfqs/`, { headers });
      setRfqs(res.data);

      if (!isVendor) {
        // Fetch Approved Requisitions
        const reqRes = await axios.get(`${API_URL}/requisitions/`, { headers });
        setRequisitions(reqRes.data.filter(r => r.status === 'approved'));
      }

      // Fetch Vendors
      const venRes = await axios.get(`${API_URL}/vendors/`, { headers });
      setVendors(venRes.data);
    } catch (err) {
      console.error("Error fetching RFQ data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchRfqDetails = async (rfq) => {
    setSelectedRfq(rfq);
    setQuotations([]);
    setComparison(null);
    setSelectedRequisitionDetails(null);
    try {
      // Fetch quotations
      const qRes = await axios.get(`${API_URL}/rfqs/${rfq.id}/quotations`, { headers });
      setQuotations(qRes.data);

      // Fetch comparison matrix (only for procurement/admin)
      if (rfq.status !== 'draft' && !isVendor) {
        const compRes = await axios.get(`${API_URL}/rfqs/${rfq.id}/comparison`, { headers });
        setComparison(compRes.data);
      }

      // Fetch requisition details (to get items for bid mock)
      const prRes = await axios.get(`${API_URL}/requisitions/${rfq.requisition_id}`, { headers });
      setSelectedRequisitionDetails(prRes.data);
    } catch (err) {
      console.error("Error fetching RFQ details:", err);
    }
  };

  const handleCreateRfq = async (e) => {
    e.preventDefault();
    if (!newRfq.requisition_id || newRfq.vendor_ids.length === 0) {
      alert("Please select a requisition and invite at least one vendor.");
      return;
    }
    try {
      const payload = {
        ...newRfq,
        requisition_id: parseInt(newRfq.requisition_id),
        vendor_ids: newRfq.vendor_ids.map(id => parseInt(id)),
        submission_deadline: new Date(newRfq.submission_deadline).toISOString()
      };
      await axios.post(`${API_URL}/rfqs/`, payload, { headers });
      alert("RFQ created successfully as DRAFT.");
      setShowCreateModal(false);
      setNewRfq({
        requisition_id: '',
        title: '',
        description: '',
        submission_deadline: '',
        terms_conditions: '',
        vendor_ids: []
      });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to create RFQ.");
    }
  };

  const handlePublishRfq = async (id) => {
    try {
      const res = await axios.post(`${API_URL}/rfqs/${id}/publish`, {}, { headers });
      alert("RFQ published successfully! Vendors are now invited to bid.");
      fetchRfqDetails(res.data);
      // Refresh list
      const listRes = await axios.get(`${API_URL}/rfqs/`, { headers });
      setRfqs(listRes.data);
    } catch (err) {
      alert("Failed to publish RFQ.");
    }
  };

  const handleAwardQuotation = async (rfqId, quoteId) => {
    if (!window.confirm("Are you sure you want to award the contract to this vendor?")) return;
    try {
      await axios.post(`${API_URL}/rfqs/${rfqId}/award/${quoteId}`, {}, { headers });
      alert("Contract awarded successfully!");
      // Refresh details and list
      const rfqRes = await axios.get(`${API_URL}/rfqs/${rfqId}`, { headers });
      fetchRfqDetails(rfqRes.data);
      const listRes = await axios.get(`${API_URL}/rfqs/`, { headers });
      setRfqs(listRes.data);
    } catch (err) {
      alert("Failed to award quotation.");
    }
  };

  // Open modal to submit vendor bid
  const openBidModal = () => {
    if (!selectedRequisitionDetails) return;
    const bidItems = selectedRequisitionDetails.items.map(item => ({
      item_description: item.item_description,
      quantity: item.quantity,
      unit_price: ''
    }));
    setNewBid({
      vendor_id: isVendor ? myVendorProfile?.id || '' : '',
      delivery_days: 5,
      validity_date: '',
      notes: '',
      items: bidItems
    });
    setShowBidModal(true);
  };

  const handleBidItemChange = (index, value) => {
    const updatedItems = [...newBid.items];
    updatedItems[index].unit_price = value;
    setNewBid({ ...newBid, items: updatedItems });
  };

  const handleSubmitBid = async (e) => {
    e.preventDefault();
    const resolvedVendorId = isVendor ? myVendorProfile?.id : parseInt(newBid.vendor_id);
    if (!resolvedVendorId) {
      alert("Please select a vendor.");
      return;
    }

    // Verify all prices are filled
    const hasEmptyPrice = newBid.items.some(item => !item.unit_price || parseFloat(item.unit_price) <= 0);
    if (hasEmptyPrice) {
      alert("Please fill in positive unit prices for all items.");
      return;
    }

    // Calculate total amount
    const totalAmount = newBid.items.reduce((sum, item) => sum + (parseFloat(item.quantity) * parseFloat(item.unit_price)), 0);

    try {
      const payload = {
        rfq_id: selectedRfq.id,
        vendor_id: resolvedVendorId,
        total_amount: totalAmount,
        currency: "USD",
        delivery_days: parseInt(newBid.delivery_days),
        validity_date: new Date(newBid.validity_date || Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        notes: newBid.notes,
        items: newBid.items.map(item => ({
          item_description: item.item_description,
          quantity: parseFloat(item.quantity),
          unit_price: parseFloat(item.unit_price)
        }))
      };

      await axios.post(`${API_URL}/rfqs/${selectedRfq.id}/quotations`, payload, { headers });
      alert("Bid submitted successfully!");
      setShowBidModal(false);
      fetchRfqDetails(selectedRfq);
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to submit bid.");
    }
  };

  const toggleVendorSelection = (id) => {
    const ids = [...newRfq.vendor_ids];
    if (ids.includes(id)) {
      setNewRfq({ ...newRfq, vendor_ids: ids.filter(vid => vid !== id) });
    } else {
      setNewRfq({ ...newRfq, vendor_ids: [...ids, id] });
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'draft': return 'badge pending';
      case 'published': return 'badge active';
      case 'awarded': return 'badge success';
      default: return 'badge inactive';
    }
  };

  // Check if current vendor has already bid on selected RFQ
  const mySubmittedQuotation = isVendor && myVendorProfile 
    ? quotations.find(q => q.vendor_id === myVendorProfile.id)
    : null;

  return (
    <div className="animate-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>
            {isVendor ? 'My RFQ Invitations' : 'RFQs & Quotations'}
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            {isVendor 
              ? 'View requested quotations from clients and submit your formal competitive bids.' 
              : 'Manage requests for quotes, analyze vendor bids, and award contracts.'
            }
          </p>
        </div>
        {!isVendor && (
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={18} />
            Create RFQ
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', alignItems: 'start' }}>
        
        {/* RFQ List Column */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '20px' }}>
            {isVendor ? 'Active Invitations' : 'Request for Quotations'}
          </h2>
          {loading ? (
            <div style={{ color: 'var(--text-secondary)' }}>Loading RFQs...</div>
          ) : rfqs.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
              {isVendor ? 'No active RFQ invitations found.' : 'No RFQs found. Create one to get started.'}
            </div>
          ) : (
            <div className="table-container" style={{ marginTop: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>RFQ Number</th>
                    <th>Title</th>
                    <th>Deadline</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rfqs.map((rfq) => (
                    <tr 
                      key={rfq.id} 
                      onClick={() => fetchRfqDetails(rfq)}
                      style={{ 
                        cursor: 'pointer', 
                        background: selectedRfq?.id === rfq.id ? 'rgba(255, 255, 255, 0.05)' : 'transparent' 
                      }}
                    >
                      <td style={{ fontWeight: 500 }}>{rfq.rfq_number}</td>
                      <td>{rfq.title}</td>
                      <td>{new Date(rfq.submission_deadline).toLocaleDateString()}</td>
                      <td><span className={getStatusBadgeClass(rfq.status)}>{rfq.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* RFQ Details & Comparison Column */}
        <div className="glass-panel" style={{ padding: '24px', minHeight: '400px' }}>
          {selectedRfq ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* RFQ Header info */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--glass-border)', paddingBottom: '16px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>{selectedRfq.rfq_number}</h2>
                    <span className={getStatusBadgeClass(selectedRfq.status)}>{selectedRfq.status}</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontWeight: 500, marginTop: '4px' }}>{selectedRfq.title}</div>
                </div>

                {!isVendor && selectedRfq.status === 'draft' && (
                  <button className="btn btn-primary" onClick={() => handlePublishRfq(selectedRfq.id)}>
                    <Send size={16} /> Publish RFQ
                  </button>
                )}
                
                {isVendor && selectedRfq.status === 'published' && !mySubmittedQuotation && (
                  <button className="btn btn-primary" onClick={openBidModal}>
                    <Send size={16} /> Submit Bid
                  </button>
                )}
                
                {!isVendor && selectedRfq.status === 'published' && (
                  <button className="btn btn-outline" onClick={openBidModal}>
                    <Plus size={16} /> Submit Mock Bid
                  </button>
                )}
              </div>

              {/* Deadline & Details */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '0.9rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                  <Calendar size={16} />
                  <span>Deadline: <strong>{new Date(selectedRfq.submission_deadline).toLocaleDateString()}</strong></span>
                </div>
                {!isVendor && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                    <FileText size={16} />
                    <span>Requisition ID: <strong>#{selectedRfq.requisition_id}</strong></span>
                  </div>
                )}
              </div>

              {/* Description */}
              {selectedRfq.description && (
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 500 }}>RFQ Description</div>
                  <div style={{ fontSize: '0.95rem' }}>{selectedRfq.description}</div>
                </div>
              )}

              {/* Terms and Conditions */}
              {selectedRfq.terms_conditions && (
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 500 }}>Terms & Conditions</div>
                  <div style={{ fontSize: '0.95rem' }}>{selectedRfq.terms_conditions}</div>
                </div>
              )}

              {/* VENDOR VIEW: If vendor already submitted bid */}
              {isVendor && mySubmittedQuotation && (
                <div style={{ marginTop: '16px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '20px', borderRadius: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-success)', fontWeight: 600, marginBottom: '12px' }}>
                    <CheckCircle size={20} />
                    <span>Your Bid is Submitted</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '0.95rem' }}>
                    <div>Quote Number: <strong>{mySubmittedQuotation.quote_number}</strong></div>
                    <div>Bid Total: <strong>${mySubmittedQuotation.total_amount.toLocaleString()}</strong></div>
                    <div>Delivery: <strong>{mySubmittedQuotation.delivery_days} days</strong></div>
                    <div>Validity: <strong>{new Date(mySubmittedQuotation.validity_date).toLocaleDateString()}</strong></div>
                  </div>
                  {mySubmittedQuotation.notes && (
                    <div style={{ marginTop: '12px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      <strong>My Notes:</strong> {mySubmittedQuotation.notes}
                    </div>
                  )}
                </div>
              )}

              {/* PROCUREMENT VIEW: Bids Comparison Matrix */}
              {!isVendor && selectedRfq.status !== 'draft' && (
                <div style={{ marginTop: '16px' }}>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <TrendingUp size={18} color="var(--accent-primary)" />
                    Quotation Comparison Matrix
                  </h3>
                  
                  {!comparison || !comparison.comparison || comparison.comparison.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', padding: '16px 0', border: '1px dashed var(--glass-border)', borderRadius: '12px', textAlign: 'center' }}>
                      No bids submitted yet by invited vendors.
                    </div>
                  ) : (
                    <div className="table-container" style={{ marginTop: 0 }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Vendor</th>
                            <th>Rating</th>
                            <th>Bid Amount</th>
                            <th>Delivery</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparison.comparison.map((bid, index) => (
                            <tr key={bid.quote_id} style={{ background: bid.is_awarded ? 'rgba(16, 185, 129, 0.08)' : 'transparent' }}>
                              <td>
                                <div style={{ fontWeight: 500 }}>{bid.vendor_name}</div>
                                {bid.is_awarded && <span style={{ fontSize: '0.7rem', color: 'var(--accent-success)', fontWeight: 600 }}>🏆 Awarded</span>}
                                {index === 0 && !bid.is_awarded && <span style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', fontWeight: 600 }}>💎 Lowest Price</span>}
                              </td>
                              <td>{bid.vendor_score.toFixed(1)} / 5</td>
                              <td style={{ fontWeight: 600 }}>${bid.total_amount.toLocaleString()} {bid.currency}</td>
                              <td>{bid.delivery_days} days</td>
                              <td>
                                {selectedRfq.status === 'published' ? (
                                  <button 
                                    className="btn btn-primary" 
                                    style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                    onClick={() => handleAwardQuotation(selectedRfq.id, bid.quote_id)}
                                  >
                                    Award
                                  </button>
                                ) : bid.is_awarded ? (
                                  <span style={{ color: 'var(--accent-success)', fontWeight: 600, fontSize: '0.8rem' }}>Winner</span>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Closed</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', padding: '80px 0' }}>
              <AlertCircle size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
              <div>
                {isVendor 
                  ? 'Select an invitation from the list to view requirements and submit your quotation.'
                  : 'Select an RFQ from the list to view invited vendors, compare submitted bids, and award contracts.'
                }
              </div>
            </div>
          )}
        </div>

      </div>

      {/* CREATE RFQ MODAL */}
      {!isVendor && showCreateModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '550px', padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Create New RFQ</h2>
            
            <form onSubmit={handleCreateRfq} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              <div className="form-group">
                <label>Select Approved Requisition</label>
                <select 
                  className="input-field" 
                  required
                  value={newRfq.requisition_id} 
                  onChange={(e) => setNewRfq({ ...newRfq, requisition_id: e.target.value })}
                >
                  <option value="">-- Choose Requisition --</option>
                  {requisitions.map(r => (
                    <option key={r.id} value={r.id}>{r.pr_number} - {r.justification || 'No justification'} (${r.total_estimated_value})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>RFQ Title</label>
                <input 
                  type="text" 
                  className="input-field" 
                  required
                  value={newRfq.title}
                  onChange={(e) => setNewRfq({ ...newRfq, title: e.target.value })}
                  placeholder="e.g. IT Equipment Supplies Q3"
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea 
                  className="input-field"
                  style={{ height: '80px', resize: 'vertical' }}
                  value={newRfq.description}
                  onChange={(e) => setNewRfq({ ...newRfq, description: e.target.value })}
                  placeholder="Details of the quotation requirement..."
                />
              </div>

              <div className="form-group">
                <label>Submission Deadline</label>
                <input 
                  type="date" 
                  className="input-field" 
                  required
                  value={newRfq.submission_deadline}
                  onChange={(e) => setNewRfq({ ...newRfq, submission_deadline: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Terms & Conditions</label>
                <textarea 
                  className="input-field"
                  style={{ height: '60px', resize: 'vertical' }}
                  value={newRfq.terms_conditions}
                  onChange={(e) => setNewRfq({ ...newRfq, terms_conditions: e.target.value })}
                  placeholder="Standard payment and delivery terms..."
                />
              </div>

              <div className="form-group">
                <label>Invite Vendors (Select at least one)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '120px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                  {vendors.map(v => (
                    <label key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={newRfq.vendor_ids.includes(v.id.toString())}
                        onChange={() => toggleVendorSelection(v.id.toString())}
                      />
                      <span>{v.company_name} ({v.category})</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px', marginTop: '12px' }}>
                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Create RFQ</button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* SUBMIT BID MODAL */}
      {showBidModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>
              {isVendor ? 'Submit My Official Quotation' : 'Submit Vendor Quotation'}
            </h2>
            
            <form onSubmit={handleSubmitBid} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {!isVendor && (
                <div className="form-group">
                  <label>Select Responding Vendor</label>
                  <select 
                    className="input-field" 
                    required
                    value={newBid.vendor_id} 
                    onChange={(e) => setNewBid({ ...newBid, vendor_id: e.target.value })}
                  >
                    <option value="">-- Choose Vendor --</option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id}>{v.company_name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label>Delivery Timeline (Days)</label>
                <input 
                  type="number" 
                  className="input-field" 
                  required
                  min="1"
                  value={newBid.delivery_days}
                  onChange={(e) => setNewBid({ ...newBid, delivery_days: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Bid Validity Date</label>
                <input 
                  type="date" 
                  className="input-field" 
                  required
                  value={newBid.validity_date}
                  onChange={(e) => setNewBid({ ...newBid, validity_date: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Bid Item Pricing</label>
                <div style={{ 
                  display: 'flex', flexDirection: 'column', gap: '12px', 
                  maxHeight: '180px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', 
                  padding: '12px', borderRadius: '12px', border: '1px solid var(--glass-border)' 
                }}>
                  {newBid.items.map((item, index) => (
                    <div key={index} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr', gap: '12px', alignItems: 'center' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.item_description}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        Qty: {parseFloat(item.quantity)}
                      </div>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>$</span>
                        <input 
                          type="number" 
                          step="0.01"
                          required
                          placeholder="Unit price"
                          className="input-field"
                          style={{ paddingLeft: '20px', paddingRight: '8px', paddingTop: '6px', paddingBottom: '6px', fontSize: '0.85rem' }}
                          value={item.unit_price}
                          onChange={(e) => handleBidItemChange(index, e.target.value)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Bid Comments / Notes</label>
                <textarea 
                  className="input-field"
                  style={{ height: '60px', resize: 'vertical' }}
                  value={newBid.notes}
                  onChange={(e) => setNewBid({ ...newBid, notes: e.target.value })}
                  placeholder="Additional conditions, warranty, etc..."
                />
              </div>

              <div style={{ display: 'flex', gap: '16px', marginTop: '12px' }}>
                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowBidModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Submit Bid</button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
