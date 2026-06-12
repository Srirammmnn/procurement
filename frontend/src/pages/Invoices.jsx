import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import { FileText, CheckCircle, AlertCircle, DollarSign, X, ArrowUpRight } from 'lucide-react';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api/v1';

export default function Invoices({ user }) {
  const location = useLocation();
  const [invoices, setInvoices] = useState([]);
  const [pos, setPos] = useState([]);
  const [grns, setGrns] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [invoiceForm, setInvoiceForm] = useState({
    invoice_number: '',
    po_id: '',
    grn_id: '',
    vendor_id: '',
    invoice_amount: '',
    currency: 'USD',
    invoice_date: new Date().toISOString().substring(0, 10),
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
  });

  const [paymentForm, setPaymentForm] = useState({
    payment_method: 'Bank Transfer',
    bank_reference: '',
    remarks: '',
  });

  const isAPOrFinance = !user || ['accounts_payable', 'finance_officer', 'administrator'].includes(user.role);
  const isAP = !user || ['accounts_payable', 'administrator'].includes(user.role);
  const isFinance = !user || ['finance_officer', 'administrator'].includes(user.role);

  const fetchData = async () => {
    try {
      const [invRes, poRes, grnRes] = await Promise.all([
        axios.get(`${API_URL}/invoices/`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
        axios.get(`${API_URL}/purchase-orders/`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
        axios.get(`${API_URL}/grns/`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
      ]);
      setInvoices(invRes.data);
      setPos(poRes.data);
      setGrns(grnRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Handle redirected states (e.g. from Purchase Orders page after GRN is created)
  useEffect(() => {
    if (pos.length > 0 && location.state?.poId) {
      const poId = location.state.poId;
      const selectedPo = pos.find(p => p.id === parseInt(poId));
      if (selectedPo) {
        setInvoiceForm(prev => ({
          ...prev,
          po_id: poId.toString(),
          vendor_id: selectedPo.vendor_id,
          invoice_amount: selectedPo.total_amount,
          currency: selectedPo.currency,
        }));
        setShowInvoiceModal(true);
      }
    }
  }, [pos, location.state]);

  const handlePoChange = (poId) => {
    const selectedPo = pos.find(p => p.id === parseInt(poId));
    if (selectedPo) {
      setInvoiceForm(prev => ({
        ...prev,
        po_id: poId,
        vendor_id: selectedPo.vendor_id,
        invoice_amount: selectedPo.total_amount,
        currency: selectedPo.currency,
      }));
    } else {
      setInvoiceForm(prev => ({
        ...prev,
        po_id: '',
        vendor_id: '',
        invoice_amount: '',
      }));
    }
  };

  const handleLogInvoiceSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        invoice_number: invoiceForm.invoice_number,
        po_id: parseInt(invoiceForm.po_id),
        grn_id: invoiceForm.grn_id ? parseInt(invoiceForm.grn_id) : null,
        vendor_id: parseInt(invoiceForm.vendor_id),
        invoice_amount: parseFloat(invoiceForm.invoice_amount),
        currency: invoiceForm.currency,
        invoice_date: new Date(invoiceForm.invoice_date).toISOString(),
        due_date: new Date(invoiceForm.due_date).toISOString(),
      };

      await axios.post(`${API_URL}/invoices/`, payload, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      alert('Invoice logged and three-way matching completed successfully!');
      setShowInvoiceModal(false);
      fetchData();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.detail || 'Failed to log invoice.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveInvoice = async (invoiceId) => {
    try {
      await axios.post(`${API_URL}/invoices/${invoiceId}/approve`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      alert('Invoice approved successfully!');
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to approve invoice.');
    }
  };

  const handleForwardPayment = async (invoiceId) => {
    try {
      await axios.post(`${API_URL}/invoices/${invoiceId}/forward-payment`, {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      alert('Invoice forwarded for payment settlement successfully!');
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to forward invoice.');
    }
  };

  const openPaymentModal = (invoice) => {
    setSelectedInvoice(invoice);
    setPaymentForm({
      payment_method: 'Bank Transfer',
      bank_reference: '',
      remarks: '',
    });
    setShowPaymentModal(true);
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // 1. Create the pending payment record
      const payRes = await axios.post(`${API_URL}/payments/`, {
        invoice_id: selectedInvoice.id,
        amount: parseFloat(selectedInvoice.invoice_amount),
        currency: selectedInvoice.currency,
        payment_method: paymentForm.payment_method,
        bank_reference: paymentForm.bank_reference,
        remarks: paymentForm.remarks,
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      const paymentId = payRes.data.id;

      // 2. Transition it to paid status immediately to finalize the flow and update the budget
      await axios.patch(`${API_URL}/payments/${paymentId}`, {
        status: 'paid'
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      alert('Payment processed and settled. Budget consumption records updated.');
      setShowPaymentModal(false);
      fetchData();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.detail || 'Failed to process payment.');
    } finally {
      setSubmitting(false);
    }
  };

  const getMatchBadgeClass = (status) => {
    switch (status) {
      case 'matched': return 'success';
      case 'approved': return 'success';
      case 'forwarded_payment': return 'active';
      case 'paid': return 'success';
      case 'mismatch': return 'danger';
      default: return 'pending';
    }
  };

  const getPoNumber = (poId) => {
    const po = pos.find(p => p.id === poId);
    return po ? po.po_number : `PO #${poId}`;
  };

  const getGrnNumber = (grnId) => {
    if (!grnId) return 'N/A';
    const grn = grns.find(g => g.id === grnId);
    return grn ? grn.grn_number : `GRN #${grnId}`;
  };

  return (
    <div className="animate-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Invoices & Accounts Payable</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Log and match invoices to POs and GRNs, then settle payment.</p>
        </div>
        {isAP && (
          <button className="btn btn-primary" onClick={() => setShowInvoiceModal(true)}>
            Log Vendor Invoice
          </button>
        )}
      </div>

      <div className="glass-panel" style={{ padding: '24px' }}>
        {loading ? (
          <div>Loading...</div>
        ) : (
          <div className="table-container" style={{ marginTop: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Invoice Number</th>
                  <th>PO Reference</th>
                  <th>GRN Reference</th>
                  <th>Amount</th>
                  <th>Match Status</th>
                  <th>Details / Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No invoices logged.</td></tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td style={{ fontWeight: 500 }}>{inv.invoice_number}</td>
                      <td>{getPoNumber(inv.po_id)}</td>
                      <td>{getGrnNumber(inv.grn_id)}</td>
                      <td>${inv.invoice_amount} {inv.currency}</td>
                      <td>
                        <span className={`badge ${getMatchBadgeClass(inv.status)}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {inv.status === 'mismatch' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'rgba(239, 68, 68, 0.05)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.15)', marginTop: '4px' }}>
                              <span style={{ color: 'var(--accent-danger)', fontSize: '0.85rem', fontWeight: 600, display: 'flex', gap: '4px', alignItems: 'center' }}>
                                <AlertCircle size={14} /> Matching Discrepancies:
                              </span>
                              <ul style={{ margin: 0, paddingLeft: '16px', color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'left' }}>
                                {inv.matching_result?.discrepancies?.map((desc, idx) => (
                                  <li key={idx}>{desc}</li>
                                )) || <li>{inv.mismatch_details}</li>}
                              </ul>
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {inv.status === 'matched' && isFinance && (
                              <button className="btn btn-primary" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => handleApproveInvoice(inv.id)}>
                                Approve Invoice
                              </button>
                            )}
                            {inv.status === 'approved' && isFinance && (
                              <button className="btn btn-primary" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => handleForwardPayment(inv.id)}>
                                Forward for Payment
                              </button>
                            )}
                            {inv.status === 'forwarded_payment' && isAP && (
                              <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '0.8rem', display: 'inline-flex', gap: '4px' }} onClick={() => openPaymentModal(inv)}>
                                <ArrowUpRight size={14} /> Settle Payment
                              </button>
                            )}
                            {inv.status === 'paid' && (
                              <span style={{ color: 'var(--accent-success)', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <CheckCircle size={14} /> Settle Completed
                              </span>
                            )}
                          </div>
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

      {/* Log Invoice Modal */}
      {showInvoiceModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '550px', padding: '32px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2>Log Vendor Invoice</h2>
              <button className="btn btn-outline" style={{ padding: '8px' }} onClick={() => setShowInvoiceModal(false)}><X size={20} /></button>
            </div>

            <form onSubmit={handleLogInvoiceSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label>Invoice Number</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. INV-2026-009"
                  value={invoiceForm.invoice_number}
                  onChange={e => setInvoiceForm({ ...invoiceForm, invoice_number: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Purchase Order (PO)</label>
                <select
                  className="input-field"
                  value={invoiceForm.po_id}
                  onChange={e => handlePoChange(e.target.value)}
                  required
                >
                  <option value="">Select PO...</option>
                  {pos.map(po => (
                    <option key={po.id} value={po.id}>{po.po_number} (${po.total_amount} {po.currency})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Goods Receipt Note (GRN)</label>
                <select
                  className="input-field"
                  value={invoiceForm.grn_id}
                  onChange={e => setInvoiceForm({ ...invoiceForm, grn_id: e.target.value })}
                >
                  <option value="">Select GRN (optional)...</option>
                  {grns
                    .filter(g => !invoiceForm.po_id || g.po_id === parseInt(invoiceForm.po_id))
                    .map(g => (
                      <option key={g.id} value={g.id}>{g.grn_number} ({new Date(g.delivery_date).toLocaleDateString()})</option>
                    ))
                  }
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label>Invoice Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-field"
                    value={invoiceForm.invoice_amount}
                    onChange={e => setInvoiceForm({ ...invoiceForm, invoice_amount: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Currency</label>
                  <input
                    type="text"
                    className="input-field"
                    value={invoiceForm.currency}
                    onChange={e => setInvoiceForm({ ...invoiceForm, currency: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label>Invoice Date</label>
                  <input
                    type="date"
                    className="input-field"
                    value={invoiceForm.invoice_date}
                    onChange={e => setInvoiceForm({ ...invoiceForm, invoice_date: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Due Date</label>
                  <input
                    type="date"
                    className="input-field"
                    value={invoiceForm.due_date}
                    onChange={e => setInvoiceForm({ ...invoiceForm, due_date: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowInvoiceModal(false)} disabled={submitting}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Processing Three-Way Matching...' : 'Verify & Log Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settle Payment Modal */}
      {showPaymentModal && selectedInvoice && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', padding: '32px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2>Settle Vendor Payment</h2>
              <button className="btn btn-outline" style={{ padding: '8px' }} onClick={() => setShowPaymentModal(false)}><X size={20} /></button>
            </div>

            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Process and record financial payout for invoice <strong>{selectedInvoice.invoice_number}</strong>.
            </p>

            <form onSubmit={handlePaymentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label>Settle Amount</label>
                <input
                  type="text"
                  className="input-field"
                  value={`$${selectedInvoice.invoice_amount} ${selectedInvoice.currency}`}
                  disabled
                />
              </div>

              <div className="form-group">
                <label>Payment Method</label>
                <select
                  className="input-field"
                  value={paymentForm.payment_method}
                  onChange={e => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                  required
                >
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Check">Check</option>
                  <option value="Credit Card">Credit Card</option>
                  <option value="Cash">Cash</option>
                </select>
              </div>

              <div className="form-group">
                <label>Bank Reference / Transaction ID</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. TXN982348234"
                  value={paymentForm.bank_reference}
                  onChange={e => setPaymentForm({ ...paymentForm, bank_reference: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Payment Remarks</label>
                <textarea
                  className="input-field"
                  placeholder="Additional payment comments..."
                  value={paymentForm.remarks}
                  onChange={e => setPaymentForm({ ...paymentForm, remarks: e.target.value })}
                  style={{ minHeight: '80px', resize: 'vertical' }}
                />
              </div>

              <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowPaymentModal(false)} disabled={submitting}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Settling Payment...' : 'Confirm Payout'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
