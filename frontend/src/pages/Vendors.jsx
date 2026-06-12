import { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api/v1';

export default function Vendors() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
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
    fetchData();
  }, []);

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Vendors</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Manage vendor relationships and details.</p>
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
                  <th>Vendor Code</th>
                  <th>Company Name</th>
                  <th>Email</th>
                  <th>Category</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {vendors.length === 0 ? (
                  <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No vendors found.</td></tr>
                ) : (
                  vendors.map((v) => (
                    <tr key={v.id}>
                      <td style={{ fontWeight: 500 }}>{v.vendor_code}</td>
                      <td>{v.company_name}</td>
                      <td>{v.email}</td>
                      <td>{v.category}</td>
                      <td><span className={`badge ${v.status === 'active' ? 'active' : 'pending'}`}>{v.status}</span></td>
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
