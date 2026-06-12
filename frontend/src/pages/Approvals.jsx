import { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api/v1';

export default function Approvals() {
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(`${API_URL}/approvals/pending`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        setApprovals(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleAction = async (stepId, action) => {
    try {
      await axios.post(`${API_URL}/approvals/${stepId}/action`, {
        action: action,
        remarks: 'Approved via dashboard'
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      // Refresh list
      const res = await axios.get(`${API_URL}/approvals/pending`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setApprovals(res.data);
    } catch (err) {
      alert('Failed to process approval.');
    }
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Approvals</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Review and approve pending requisitions.</p>
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
                  <th>PR Number</th>
                  <th>Total Value</th>
                  <th>Due Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {approvals.length === 0 ? (
                  <tr><td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No pending approvals.</td></tr>
                ) : (
                  approvals.map((a) => (
                    <tr key={a.step_id}>
                      <td style={{ fontWeight: 500 }}>{a.pr_number}</td>
                      <td>${a.total_value}</td>
                      <td>{a.due_date ? new Date(a.due_date).toLocaleDateString() : 'N/A'}</td>
                      <td style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          className="btn" 
                          style={{ background: 'rgba(16, 185, 129, 0.2)', color: 'var(--accent-success)', padding: '6px 12px', fontSize: '0.8rem' }}
                          onClick={() => handleAction(a.step_id, 'approved')}
                        >
                          Approve
                        </button>
                        <button 
                          className="btn" 
                          style={{ background: 'rgba(239, 68, 68, 0.2)', color: 'var(--accent-danger)', padding: '6px 12px', fontSize: '0.8rem' }}
                          onClick={() => handleAction(a.step_id, 'rejected')}
                        >
                          Reject
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
