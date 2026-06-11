import { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:8000/api/v1';

export default function RFQs() {
  const [rfqs, setRfqs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(`${API_URL}/rfqs/`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        setRfqs(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>RFQs & Quotations</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Manage Request for Quotations.</p>
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
                  <th>RFQ Number</th>
                  <th>Title</th>
                  <th>Deadline</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rfqs.length === 0 ? (
                  <tr><td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No RFQs found.</td></tr>
                ) : (
                  rfqs.map((rfq) => (
                    <tr key={rfq.id}>
                      <td style={{ fontWeight: 500 }}>{rfq.rfq_number}</td>
                      <td>{rfq.title}</td>
                      <td>{new Date(rfq.submission_deadline).toLocaleDateString()}</td>
                      <td><span className={`badge ${rfq.status === 'draft' ? 'pending' : 'active'}`}>{rfq.status}</span></td>
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
