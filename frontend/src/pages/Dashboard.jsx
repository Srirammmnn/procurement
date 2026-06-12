import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ShoppingCart, FileText, PackageOpen, Users as UsersIcon, ArrowUpRight, ArrowDownRight, Bell, Star, LogOut } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import Requisitions from './Requisitions';
import PurchaseOrders from './PurchaseOrders';
import Users from './Users';
import Vendors from './Vendors';
import Approvals from './Approvals';
import Invoices from './Invoices';
import Payments from './Payments';
import RFQs from './RFQs';
import Settings from './Settings';
import axios from 'axios';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api/v1';

function SpendByDepartmentChart({ data }) {
  const [hoveredBar, setHoveredBar] = useState(null);

  if (!data || data.length === 0) {
    return <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>No department spend data available.</div>;
  }

  const maxVal = Math.max(...data.map(d => d.total), 1000);
  const chartHeight = 160;
  const barWidth = 36;
  const gap = 24;
  const chartWidth = data.length * (barWidth + gap) + 40;

  return (
    <div style={{ position: 'relative', width: '100%', padding: '10px 0' }}>
      <svg width="100%" height={chartHeight + 40} viewBox={`0 0 ${chartWidth} ${chartHeight + 40}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="barGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="var(--accent-primary)" />
            <stop offset="100%" stopColor="var(--accent-secondary)" />
          </linearGradient>
        </defs>

        {/* Y Axis Guide Lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => (
          <line
            key={idx}
            x1="20"
            y1={chartHeight * (1 - ratio) + 10}
            x2={chartWidth}
            y2={chartHeight * (1 - ratio) + 10}
            stroke="rgba(255, 255, 255, 0.05)"
            strokeDasharray="4 4"
          />
        ))}

        {/* Bars */}
        {data.map((item, idx) => {
          const barHeight = (item.total / maxVal) * chartHeight;
          const x = 30 + idx * (barWidth + gap);
          const y = chartHeight - barHeight + 10;

          return (
            <g
              key={idx}
              onMouseEnter={() => setHoveredBar({ ...item, x: x + barWidth / 2, y })}
              onMouseLeave={() => setHoveredBar(null)}
              style={{ cursor: 'pointer' }}
            >
              {/* Background Bar */}
              <rect
                x={x}
                y="10"
                width={barWidth}
                height={chartHeight}
                rx="6"
                fill="rgba(255, 255, 255, 0.02)"
              />

              {/* Foreground Animated Bar */}
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx="6"
                fill="url(#barGrad)"
                style={{
                  transition: 'y 0.5s ease, height 0.5s ease',
                  filter: hoveredBar?.department === item.department ? 'brightness(1.2)' : 'none'
                }}
              />

              {/* Text Label */}
              <text
                x={x + barWidth / 2}
                y={chartHeight + 25}
                textAnchor="middle"
                fill="var(--text-secondary)"
                fontSize="10"
                fontWeight="500"
              >
                {item.department.substring(0, 6)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hoveredBar && (
        <div style={{
          position: 'absolute',
          left: `${(hoveredBar.x / chartWidth) * 100}%`,
          top: `${(hoveredBar.y / (chartHeight + 40)) * 100 - 8}%`,
          transform: 'translate(-50%, -100%)',
          background: 'rgba(15, 15, 25, 0.95)',
          backdropFilter: 'blur(8px)',
          border: '1px solid var(--glass-border)',
          borderRadius: '8px',
          padding: '6px 10px',
          pointerEvents: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          zIndex: 10,
          whiteSpace: 'nowrap',
          transition: 'all 0.1s ease-out'
        }}>
          <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{hoveredBar.department}</div>
          <div style={{ color: 'var(--accent-primary)', fontWeight: 500, fontSize: '0.75rem' }}>
            Spend: ${hoveredBar.total.toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}

function BudgetUtilizationDonut({ percent }) {
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 0' }}>
      <div style={{ position: 'relative', width: '120px', height: '120px' }}>
        <svg width="120" height="120" viewBox="0 0 120 120">
          <defs>
            <linearGradient id="donutGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--accent-primary)" />
              <stop offset="100%" stopColor="var(--accent-success)" />
            </linearGradient>
          </defs>
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="transparent"
            stroke="rgba(255, 255, 255, 0.05)"
            strokeWidth="8"
          />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="transparent"
            stroke="url(#donutGrad)"
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform="rotate(-90 60 60)"
            style={{
              transition: 'stroke-dashoffset 0.8s ease'
            }}
          />
        </svg>
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#fff' }}>{percent}%</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Used</div>
        </div>
      </div>
    </div>
  );
}

function DashboardHome({ user }) {
  const [kpis, setKpis] = useState({
    total_procurement_spend: 0,
    open_purchase_orders: 0,
    pending_approvals: 0,
    budget_utilization_percent: 0,
    average_vendor_rating: 0,
    spend_by_department: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchKpis = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/reports/dashboard`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setKpis(res.data);
      } catch (err) {
        console.error("Failed to load dashboard KPIs:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchKpis();
  }, []);

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Dashboard Overview</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Welcome back, {user.full_name}. Here's what's happening today.</p>
        </div>
      </div>

      {loading ? (
        <div>Loading reports data...</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '24px' }}>
            <div className="glass-panel stat-card delay-1 animate-in">
              <div className="stat-header">
                <span style={{ fontWeight: 500 }}>Total Spend</span>
                <div className="stat-icon primary">
                  <ShoppingCart size={20} />
                </div>
              </div>
              <div className="stat-value">${kpis.total_procurement_spend.toLocaleString()}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <span>Paid invoice spend</span>
              </div>
            </div>

            <div className="glass-panel stat-card delay-2 animate-in">
              <div className="stat-header">
                <span style={{ fontWeight: 500 }}>Open POs</span>
                <div className="stat-icon warning">
                  <PackageOpen size={20} />
                </div>
              </div>
              <div className="stat-value">{kpis.open_purchase_orders}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <span>Issued / Deliv pending</span>
              </div>
            </div>

            <div className="glass-panel stat-card delay-3 animate-in">
              <div className="stat-header">
                <span style={{ fontWeight: 500 }}>Pending Approvals</span>
                <div className="stat-icon success">
                  <Bell size={20} />
                </div>
              </div>
              <div className="stat-value">{kpis.pending_approvals}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <span>Awaiting action</span>
              </div>
            </div>

            <div className="glass-panel stat-card delay-4 animate-in">
              <div className="stat-header">
                <span style={{ fontWeight: 500 }}>Vendor Rating</span>
                <div className="stat-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--accent-warning)' }}>
                  <Star size={20} fill="var(--accent-warning)" />
                </div>
              </div>
              <div className="stat-value">{kpis.average_vendor_rating} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>/ 5</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <span>Performance index</span>
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '32px', marginTop: '32px' }}>
            {/* Spend by Department Bar Chart */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h2 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Spend by Department ($)</h2>
              <SpendByDepartmentChart data={kpis.spend_by_department} />
            </div>

            {/* Budget Utilization Donut Chart */}
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: '1.25rem', marginBottom: '16px', alignSelf: 'flex-start' }}>Budget Utilization Rate</h2>
              <BudgetUtilizationDonut percent={kpis.budget_utilization_percent} />
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', marginTop: '10px' }}>
                System-wide consumed budget relative to overall department allocations.
              </div>
            </div>
          </div>

          {/* Recent Activity Table */}
          <div className="glass-panel" style={{ marginTop: '32px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.25rem' }}>Recent System Operations</h2>
            </div>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Type</th>
                    <th>Department</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 500 }}>REQ-2026-001</td>
                    <td>IT Equipment</td>
                    <td>Engineering</td>
                    <td style={{ color: 'var(--text-secondary)' }}>Today, 09:41 AM</td>
                    <td><span className="badge pending">Pending Approval</span></td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 500 }}>PO-2026-042</td>
                    <td>Software Licenses</td>
                    <td>Marketing</td>
                    <td style={{ color: 'var(--text-secondary)' }}>Yesterday, 14:20 PM</td>
                    <td><span className="badge active">Issued</span></td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 500 }}>VND-2026-089</td>
                    <td>New Vendor Reg</td>
                    <td>Procurement</td>
                    <td style={{ color: 'var(--text-secondary)' }}>Jun 07, 11:30 AM</td>
                    <td><span className="badge active">Active</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function Dashboard({ user, onLogout }) {
  const isVendor = user?.role?.toLowerCase() === 'vendor';

  return (
    <div className="layout">
      <Sidebar user={user} onLogout={onLogout} />
      <main className="main-content">
        {/* Global Topbar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '32px', gap: '16px' }}>
          <div className="user-profile">
            <div className="avatar" style={{ width: '36px', height: '36px' }}>
              {user?.full_name?.charAt(0)}
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>{user?.full_name?.split(' ')[0]}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user?.department}</div>
            </div>
          </div>
          <button onClick={onLogout} className="btn" style={{ 
            padding: '10px 20px', 
            background: 'rgba(239, 68, 68, 0.15)', 
            color: 'var(--accent-danger)', 
            border: '1px solid rgba(239, 68, 68, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderRadius: '12px',
            fontWeight: '600'
          }}>
            <LogOut size={18} /> Sign Out
          </button>
        </div>

        <Routes>
          {isVendor ? (
            <>
              <Route path="/rfqs" element={<RFQs user={user} />} />
              <Route path="*" element={<Navigate to="/rfqs" replace />} />
            </>
          ) : (
            <>
              <Route path="/" element={<DashboardHome user={user} />} />
              <Route path="/requisitions" element={<Requisitions user={user} />} />
              <Route path="/purchase-orders" element={<PurchaseOrders user={user} />} />
              <Route path="/users" element={<Users />} />
              <Route path="/vendors" element={<Vendors />} />
              <Route path="/approvals" element={<Approvals />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/payments" element={<Payments user={user} />} />
              <Route path="/rfqs" element={<RFQs user={user} />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={
                <div className="animate-in" style={{ textAlign: 'center', padding: '100px 0' }}>
                  <div style={{ display: 'inline-flex', padding: '24px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-primary)', marginBottom: '24px' }}>
                    <FileText size={48} />
                  </div>
                  <h2 style={{ fontSize: '2rem', marginBottom: '16px' }}>Coming Soon</h2>
                  <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto' }}>
                    This module is currently under development. Please check back later.
                  </p>
                </div>
              } />
            </>
          )}
        </Routes>
      </main>
    </div>
  );
}
