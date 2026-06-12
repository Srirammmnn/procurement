import { useState, useEffect } from 'react';
import axios from 'axios';
import { Save, Mail, ShieldCheck, Server, Key, User } from 'lucide-react';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api/v1';

export default function Settings() {
  const [formData, setFormData] = useState({
    mail_server: '',
    mail_port: '587',
    mail_username: '',
    mail_password: '',
    mail_from: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await axios.get(`${API_URL}/settings/`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        setFormData(res.data);
      } catch (err) {
        console.error(err);
        setMessage({ text: 'Failed to load settings.', type: 'danger' });
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ text: '', type: '' });
    try {
      await axios.post(`${API_URL}/settings/`, formData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setMessage({ text: 'SMTP settings updated successfully!', type: 'success' });
      // Refresh to get masked password
      const res = await axios.get(`${API_URL}/settings/`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setFormData(res.data);
    } catch (err) {
      console.error(err);
      setMessage({ text: err.response?.data?.detail || 'Failed to save settings.', type: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>System Settings</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Configure global SMTP credentials and email notifications.</p>
        </div>
      </div>

      <div style={{ maxWidth: '600px' }}>
        <form onSubmit={handleSubmit} className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '16px' }}>
            <Mail size={24} color="var(--accent-primary)" />
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>SMTP Mail Configuration</h2>
          </div>

          {message.text && (
            <div style={{
              color: message.type === 'success' ? 'var(--accent-success)' : 'var(--accent-danger)',
              background: message.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              padding: '12px 16px',
              borderRadius: '12px',
              border: `1px solid ${message.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
              fontSize: '0.95rem'
            }}>
              {message.text}
            </div>
          )}

          {loading ? (
            <div style={{ padding: '20px 0', color: 'var(--text-secondary)' }}>Loading settings...</div>
          ) : (
            <>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Server size={16} /> SMTP Server Host
                </label>
                <input
                  type="text"
                  name="mail_server"
                  className="input-field"
                  required
                  value={formData.mail_server}
                  onChange={handleChange}
                  placeholder="smtp.gmail.com"
                />
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldCheck size={16} /> SMTP Port
                </label>
                <input
                  type="text"
                  name="mail_port"
                  className="input-field"
                  required
                  value={formData.mail_port}
                  onChange={handleChange}
                  placeholder="587"
                />
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <User size={16} /> SMTP Username (Email)
                </label>
                <input
                  type="email"
                  name="mail_username"
                  className="input-field"
                  required
                  value={formData.mail_username}
                  onChange={handleChange}
                  placeholder="example@gmail.com"
                />
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Key size={16} /> SMTP App Password
                </label>
                <input
                  type="password"
                  name="mail_password"
                  className="input-field"
                  value={formData.mail_password}
                  onChange={handleChange}
                  placeholder="••••••••••••••••"
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Leave password as is (masked) unless you want to update it.
                </span>
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Mail size={16} /> Sender Address (From)
                </label>
                <input
                  type="email"
                  name="mail_from"
                  className="input-field"
                  value={formData.mail_from}
                  onChange={handleChange}
                  placeholder="noreply@company.com"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '12px' }}
              >
                <Save size={18} />
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </>
          )}

        </form>
      </div>
    </div>
  );
}
