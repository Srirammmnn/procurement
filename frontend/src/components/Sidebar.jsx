import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  FileText,
  Users,
  Settings,
  LogOut,
  PackageOpen,
  CheckSquare,
  Building2,
  Receipt,
  CreditCard
} from 'lucide-react';

export default function Sidebar({ user, onLogout }) {
  const getNavLinks = () => {
    if (user?.role?.toLowerCase() === 'vendor') {
      return [
        { path: '/rfqs', icon: <FileText size={20} />, label: 'My RFQ Bids' }
      ];
    }

    const base = [
      { path: '/', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
      { path: '/requisitions', icon: <ShoppingCart size={20} />, label: 'Requisitions' },
      { path: '/purchase-orders', icon: <PackageOpen size={20} />, label: 'Purchase Orders' },
    ];

    if (['procurement_manager', 'procurement_officer', 'administrator', 'auditor'].includes(user.role.toLowerCase())) {
      base.push(
        { path: '/rfqs', icon: <FileText size={20} />, label: 'RFQs & Quotes' },
        { path: '/vendors', icon: <Building2 size={20} />, label: 'Vendors' }
      );
    }

    if (['manager', 'procurement_manager', 'finance_officer', 'administrator'].includes(user.role.toLowerCase())) {
      base.push({ path: '/approvals', icon: <CheckSquare size={20} />, label: 'Approvals' });
    }

    if (['finance_officer', 'accounts_payable', 'administrator', 'auditor'].includes(user.role.toLowerCase())) {
      base.push(
        { path: '/invoices', icon: <Receipt size={20} />, label: 'Invoices & Matching' },
        { path: '/payments', icon: <CreditCard size={20} />, label: 'Payment Ledger' }
      );
    }

    if (user.role.toLowerCase() === 'administrator') {
      base.push({ path: '/users', icon: <Users size={20} />, label: 'User Management' });
    }

    if (['administrator', 'procurement_manager'].includes(user.role.toLowerCase())) {
      base.push({ path: '/settings', icon: <Settings size={20} />, label: 'Settings' });
    }

    return base;
  };

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <PackageOpen size={28} color="var(--accent-primary)" />
        <span>ProcureHub</span>
      </div>

      <div className="nav-links" style={{ flex: 1 }}>
        {getNavLinks().map((link) => (
          <NavLink
            key={link.path}
            to={link.path}
            className={({ isActive }) => `nav-link ${isActive && link.path === '/' ? 'active' : ''}`}
          >
            {link.icon}
            {link.label}
          </NavLink>
        ))}
      </div>

      <div style={{ marginTop: 'auto', borderTop: '1px solid var(--glass-border)', paddingTop: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div className="avatar">
            {user.full_name.charAt(0)}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontWeight: 500, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{user.full_name}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
              {user.role.replace('_', ' ')}
            </div>
          </div>
        </div>

        <button onClick={onLogout} className="btn btn-outline" style={{ width: '100%' }}>
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </div>
  );
}
