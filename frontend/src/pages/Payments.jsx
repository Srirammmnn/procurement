import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  CreditCard, Search, Filter, Calendar, DollarSign, 
  FileText, CheckCircle, Clock, ArrowUpRight, X, Printer,
  AlertTriangle, ShieldAlert
} from 'lucide-react';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api/v1';

export default function Payments({ user }) {
  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [pos, setPos] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter & Search states
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals state
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const isFinanceOrAdmin = user && ['finance_officer', 'administrator'].includes(user.role.toLowerCase());
  const isAPOrAdmin = user && ['accounts_payable', 'administrator'].includes(user.role.toLowerCase());

  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      
      const [payRes, invRes, venRes, poRes, userRes] = await Promise.all([
        axios.get(`${API_URL}/payments/`, { headers }),
        axios.get(`${API_URL}/invoices/`, { headers }),
        axios.get(`${API_URL}/vendors/`, { headers }),
        axios.get(`${API_URL}/purchase-orders/`, { headers }),
        axios.get(`${API_URL}/users/`, { headers }).catch(() => ({ data: [] })) // Fallback if user endpoint has restricted access
      ]);

      setPayments(payRes.data);
      setInvoices(invRes.data);
      setVendors(venRes.data);
      setPos(poRes.data);
      setUsers(userRes.data);
    } catch (err) {
      console.error('Error fetching payment data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpdateStatus = async (paymentId, newStatus) => {
    setUpdatingStatus(true);
    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      await axios.patch(`${API_URL}/payments/${paymentId}`, {
        status: newStatus,
        payment_date: newStatus === 'paid' ? new Date().toISOString() : null
      }, { headers });
      
      alert(`Payment status updated to ${newStatus.toUpperCase()} successfully.`);
      setShowDetailModal(false);
      fetchData();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.detail || 'Failed to update payment status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Helper selectors
  const getInvoiceDetails = (invoiceId) => {
    return invoices.find(i => i.id === invoiceId) || null;
  };

  const getPoDetailsForPayment = (invoiceId) => {
    const inv = getInvoiceDetails(invoiceId);
    if (!inv) return null;
    return pos.find(p => p.id === inv.po_id) || null;
  };

  const getVendorForPayment = (invoiceId) => {
    const inv = getInvoiceDetails(invoiceId);
    if (!inv) return null;
    return vendors.find(v => v.id === inv.vendor_id) || null;
  };

  const getUserName = (userId) => {
    if (!userId) return 'System';
    const u = users.find(x => x.id === userId);
    return u ? u.full_name : `User #${userId}`;
  };

  const getStatusBadgeClass = (status) => {
    switch (status?.toLowerCase()) {
      case 'paid': return 'success';
      case 'approved': return 'active';
      case 'pending': return 'warning';
      case 'under_review': return 'pending';
      case 'rejected': return 'danger';
      default: return 'pending';
    }
  };

  // KPI Calculations
  const totalPaid = payments
    .filter(p => p.status?.toLowerCase() === 'paid')
    .reduce((sum, p) => sum + parseFloat(p.amount), 0);

  const pendingSettlement = payments
    .filter(p => ['pending', 'under_review'].includes(p.status?.toLowerCase()))
    .reduce((sum, p) => sum + parseFloat(p.amount), 0);

  const pendingCount = payments.filter(p => ['pending', 'under_review'].includes(p.status?.toLowerCase())).length;

  // Filtering Logic
  const filteredPayments = payments.filter(pay => {
    const inv = getInvoiceDetails(pay.invoice_id);
    const vendor = getVendorForPayment(pay.invoice_id);
    
    const searchString = `${pay.payment_reference} ${pay.bank_reference || ''} ${inv?.invoice_number || ''} ${vendor?.company_name || ''}`.toLowerCase();
    const matchesSearch = searchString.includes(search.toLowerCase());
    const matchesMethod = !methodFilter || pay.payment_method?.toLowerCase() === methodFilter.toLowerCase();
    const matchesStatus = !statusFilter || pay.status?.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesMethod && matchesStatus;
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="animate-in" style={{ padding: '40px max(24px, 4vw)', maxWidth: '1400px', margin: '0 auto' }}>
      
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 800, background: 'linear-gradient(135deg, #fff 30%, var(--text-secondary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.02em' }}>
            Payment Transactions
          </h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '6px', fontSize: '1rem' }}>
            Ledger of financial settlements, budget consumption, and vendor payouts.
          </p>
        </div>
      </div>

      {/* KPI Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px', marginBottom: '40px' }}>
        
        <div className="glass-panel card-glow" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-success)' }}>
            <DollarSign size={28} />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Settled Payouts</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '4px' }}>
              ${totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <div className="glass-panel card-glow" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--accent-warning)' }}>
            <Clock size={28} />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending Settlements</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '4px' }}>
              ${pendingSettlement.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <div className="glass-panel card-glow" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-primary)' }}>
            <CreditCard size={28} />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Awaiting Payouts</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '4px' }}>
              {pendingCount} Transactions
            </div>
          </div>
        </div>

      </div>

      {/* Filter and search bar */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ flex: 1, minWidth: '280px', position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input-field"
              placeholder="Search by Payment Ref, Invoice No, or Vendor name..."
              style={{ paddingLeft: '44px' }}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div style={{ width: '180px' }}>
            <select
              className="input-field"
              value={methodFilter}
              onChange={e => setMethodFilter(e.target.value)}
            >
              <option value="">All Payment Methods</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Check">Check</option>
              <option value="Credit Card">Credit Card</option>
              <option value="Cash">Cash</option>
            </select>
          </div>

          <div style={{ width: '180px' }}>
            <select
              className="input-field"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="under_review">Under Review</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Ledger Table */}
      <div className="glass-panel" style={{ padding: '0px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div className="spinner" style={{ marginBottom: '16px' }}></div>
            Loading transaction ledger...
          </div>
        ) : filteredPayments.length === 0 ? (
          <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            <CreditCard size={48} style={{ marginBottom: '16px', opacity: 0.3 }} />
            <div>No matching transactions found.</div>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Payment Ref</th>
                  <th>Invoice No</th>
                  <th>Vendor</th>
                  <th>Amount</th>
                  <th>Payment Method</th>
                  <th>Settled Date</th>
                  <th>Bank Reference</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((pay) => {
                  const inv = getInvoiceDetails(pay.invoice_id);
                  const vendor = getVendorForPayment(pay.invoice_id);

                  return (
                    <tr key={pay.id} style={{ cursor: 'pointer' }} onClick={() => { setSelectedPayment(pay); setShowDetailModal(true); }}>
                      <td style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>{pay.payment_reference}</td>
                      <td>{inv ? inv.invoice_number : `INV #${pay.invoice_id}`}</td>
                      <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {vendor ? vendor.company_name : 'N/A'}
                      </td>
                      <td style={{ fontWeight: 600 }}>${parseFloat(pay.amount).toFixed(2)} {pay.currency}</td>
                      <td>{pay.payment_method || 'Bank Transfer'}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {pay.payment_date ? new Date(pay.payment_date).toLocaleDateString() : 'Pending'}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{pay.bank_reference || 'N/A'}</td>
                      <td>
                        <span className={`badge ${getStatusBadgeClass(pay.status)}`}>
                          {pay.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                        <button 
                          className="btn btn-outline" 
                          style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                          onClick={() => { setSelectedPayment(pay); setShowDetailModal(true); }}
                        >
                          View Receipt
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transaction Details Modal */}
      {showDetailModal && selectedPayment && (() => {
        const inv = getInvoiceDetails(selectedPayment.invoice_id);
        const po = getPoDetailsForPayment(selectedPayment.invoice_id);
        const vendor = getVendorForPayment(selectedPayment.invoice_id);

        return (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', padding: '32px', maxHeight: '90vh', overflowY: 'auto' }}>
              
              {/* Modal Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <CreditCard size={24} color="var(--accent-primary)" />
                  <div>
                    <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Transaction Receipt</h2>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{selectedPayment.payment_reference}</span>
                  </div>
                </div>
                <button className="btn btn-outline" style={{ padding: '8px' }} onClick={() => setShowDetailModal(false)}><X size={20} /></button>
              </div>

              {/* Receipt Body */}
              <div id="payment-receipt" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* Status Alert */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>Payment Status</span>
                    <strong style={{ fontSize: '1.1rem', textTransform: 'capitalize' }}>{selectedPayment.status}</strong>
                  </div>
                  <span className={`badge ${getStatusBadgeClass(selectedPayment.status)}`} style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                    {selectedPayment.status.toUpperCase()}
                  </span>
                </div>

                {/* Main Details Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px', background: 'rgba(0,0,0,0.15)', padding: '20px', borderRadius: '12px' }}>
                  
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Amount Settled</span>
                    <strong style={{ fontSize: '1.2rem', color: 'var(--accent-success)' }}>
                      ${parseFloat(selectedPayment.amount).toFixed(2)} {selectedPayment.currency}
                    </strong>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Settlement Date</span>
                    <strong style={{ fontSize: '1rem' }}>
                      {selectedPayment.payment_date ? new Date(selectedPayment.payment_date).toLocaleString() : 'Awaiting Processing'}
                    </strong>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Payment Method</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 500 }}>{selectedPayment.payment_method || 'Bank Transfer'}</span>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Bank Transaction Ref</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 500, fontFamily: 'monospace' }}>{selectedPayment.bank_reference || 'N/A'}</span>
                  </div>

                  <div style={{ gridColumn: 'span 2', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Vendor Recipient</span>
                    <span style={{ fontSize: '1rem', fontWeight: 600 }}>{vendor ? vendor.company_name : 'N/A'}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>{vendor?.email} | {vendor?.phone}</span>
                  </div>

                  <div style={{ gridColumn: 'span 2', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Associated Invoice & PO</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 500, display: 'block' }}>Invoice: {inv ? inv.invoice_number : 'N/A'}</span>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', display: 'block' }}>Purchase Order: {po ? po.po_number : 'N/A'} (Total Amount: ${po ? parseFloat(po.total_amount).toFixed(2) : '0.00'})</span>
                  </div>

                  <div style={{ gridColumn: 'span 2', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Processed By</span>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{getUserName(selectedPayment.processed_by)}</span>
                  </div>

                  {selectedPayment.remarks && (
                    <div style={{ gridColumn: 'span 2', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Transaction Remarks</span>
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.1)', padding: '10px', borderRadius: '8px' }}>
                        {selectedPayment.remarks}
                      </p>
                    </div>
                  )}

                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '24px' }}>
                <button className="btn btn-outline" style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }} onClick={handlePrint}>
                  <Printer size={16} /> Print Receipt
                </button>
                
                <div style={{ display: 'flex', gap: '12px' }}>
                  {/* Status controls for Accounts Payable / Admin if payment is pending */}
                  {['pending', 'under_review'].includes(selectedPayment.status?.toLowerCase()) && isFinanceOrAdmin && (
                    <>
                      <button 
                        className="btn btn-outline" 
                        style={{ borderColor: 'var(--accent-danger)', color: 'var(--accent-danger)' }}
                        disabled={updatingStatus}
                        onClick={() => handleUpdateStatus(selectedPayment.id, 'rejected')}
                      >
                        Reject
                      </button>
                      <button 
                        className="btn btn-primary" 
                        style={{ background: 'var(--accent-success)' }}
                        disabled={updatingStatus}
                        onClick={() => handleUpdateStatus(selectedPayment.id, 'paid')}
                      >
                        Approve & Settle
                      </button>
                    </>
                  )}
                  <button className="btn btn-outline" onClick={() => setShowDetailModal(false)}>Close</button>
                </div>
              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
}
