import { useState, useEffect } from 'react';
import axios from 'axios';
import { Users as UsersIcon } from 'lucide-react';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api/v1';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
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
    fetchUsers();
  }, []);

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>User Management</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Manage system users and their roles.</p>
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
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No users found.</td></tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 500 }}>{u.full_name}</td>
                      <td>{u.email}</td>
                      <td><span className="badge pending">{u.role.replace('_', ' ')}</span></td>
                      <td>{u.department}</td>
                      <td><span className={`badge ${u.is_active ? 'active' : 'inactive'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
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
