import React, { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { clearAuthSession, getAuthToken, getTenantKey, setAuthSession, setTenantKey } from './tenant';

import TripManagement from './pages/TripManagement';
import Billing from './pages/Billing';
import LocationMaster from './pages/LocationMaster';
import LedgerDashboard from './pages/LedgerDashboard';
import AccountMaster from './pages/AccountMaster';
import ClientMaster from './pages/ClientMaster';
import VehicleMaster from './pages/VehicleMaster';
import DriverMaster from './pages/DriverMaster';
import RouteMaster from './pages/RouteMaster';
import MyCompanyProfile from './pages/MyCompanyProfile';
import DieselManagement from './pages/DieselManagement';
import VendorSettlement from './pages/VendorSettlement';
import Reports from './pages/Reports';
import DriverSettlement from './pages/DriverSettlement';
import PaymentVouchers from './pages/PaymentVouchers';
import AdminUsers from './pages/AdminUsers';
import LoanTracking from './pages/LoanTracking';
import Reminders from './pages/Reminders';

function profileScore(profile) {
  const isPlaceholder = String(profile.companyName || '').trim().toLowerCase() === 'default company';
  const filledFields = ['gstNumber', 'panNumber', 'address', 'bankName', 'accountNumber']
    .filter(field => String(profile[field] || '').trim()).length;
  return (isPlaceholder ? 0 : 10) + filledFields;
}

function dedupeProfiles(items) {
  const byTenant = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item?.tenantKey) continue;
    const current = byTenant.get(item.tenantKey);
    if (!current || profileScore(item) > profileScore(current)) {
      byTenant.set(item.tenantKey, item);
    }
  }
  return Array.from(byTenant.values()).sort((a, b) => (a.companyName || '').localeCompare(b.companyName || ''));
}
function companyOptionLabel(profile) {
  const name = profile.companyName || profile.tenantKey;
  return `${name} (${profile.tenantKey})`;
}
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed.');
      setAuthSession(data.token, data.user);
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <form className="login-panel" onSubmit={submit}>
        <h1>Logistics ERP</h1>
        <label>Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required />
        <label>Password</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
        {error && <div className="login-error">{error}</div>}
        <button className="primary-btn" disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</button>
      </form>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [tenant, setTenant] = useState(getTenantKey());
  const [profiles, setProfiles] = useState([]);
  const isSuperAdmin = user?.role === 'SUPERADMIN';

  useEffect(() => {
    if (!getAuthToken()) {
      clearAuthSession();
      setAuthReady(true);
      return;
    }

    fetch('/api/auth/me')
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => {
        const restoredUser = data.user;
        if (restoredUser?.role !== 'SUPERADMIN' && restoredUser?.companies?.length) {
          const storedTenant = getTenantKey();
          if (!restoredUser.companies.includes(storedTenant)) {
            const nextTenant = setTenantKey(restoredUser.companies[0]);
            setTenant(nextTenant);
          }
        }
        setUser(restoredUser);
      })
      .catch(() => {
        clearAuthSession();
        setUser(null);
      })
      .finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    const logoutExpired = () => setUser(null);
    window.addEventListener('auth-expired', logoutExpired);
    return () => window.removeEventListener('auth-expired', logoutExpired);
  }, []);

  const loadProfiles = async () => {
    const res = await fetch('/api/my-company/all');
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to load assigned companies.');
    }
    const data = await res.json();
    const list = dedupeProfiles(data);
    setProfiles(list);
    const allowedKeys = list.map(item => item.tenantKey);
    if (allowedKeys.length && !allowedKeys.includes(tenant)) {
      const nextTenant = setTenantKey(allowedKeys[0]);
      setTenant(nextTenant);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadProfiles().catch(() => setProfiles([]));
  }, [user, tenant]);

  const handleTenantChange = (value) => {
    const nextTenant = setTenantKey(value);
    setTenant(nextTenant);
    window.location.reload();
  };

  const logout = () => {
    clearAuthSession();
    setUser(null);
  };

  if (!authReady) {
    return (
      <div className="login-shell">
        <div className="login-panel">
          <h1>Logistics ERP</h1>
          <div className="status-banner">Checking login...</div>
        </div>
      </div>
    );
  }

  if (!user) return <LoginScreen onLogin={setUser} />;

  return (
    <div className="app-shell">
      <nav className="sidebar no-print">
        <div className="sidebar-header">Logistics ERP</div>
        <div className="user-panel">
          <strong>{user.name}</strong>
          <span>{user.role}</span>
          <button onClick={logout}>Logout</button>
        </div>
        <div className="tenant-panel">
          <label htmlFor="tenantSelect">Company</label>
          <select id="tenantSelect" value={tenant} onChange={(e) => handleTenantChange(e.target.value)}>
            {profiles.map(profile => (
              <option key={profile.tenantKey} value={profile.tenantKey}>
                {companyOptionLabel(profile)}
              </option>
            ))}
          </select>
        </div>

        <div className="nav-group">
          <div className="nav-group-title">Executive</div>
          <NavLink to="/" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>Reports Dashboard</NavLink>
          <NavLink to="/reminders" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>Reminders</NavLink>
        </div>
        <div className="nav-group">
          <div className="nav-group-title">Operations</div>
          <NavLink to="/trips" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>Trip Dispatch</NavLink>
          <NavLink to="/diesel" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>Diesel Tracking</NavLink>
        </div>
        <div className="nav-group">
          <div className="nav-group-title">Finance & Billing</div>
          <NavLink to="/billing" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>Client Invoicing</NavLink>
          <NavLink to="/settlements" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>Vendor Settlements</NavLink>
          <NavLink to="/driver-settlements" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>Driver Trip Sheets</NavLink>
          <NavLink to="/payments" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>Payment Vouchers</NavLink>
          <NavLink to="/ledger" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>Ledger Dashboard</NavLink>
          <NavLink to="/loans" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>Loan Tracking</NavLink>
        </div>
        <div className="nav-group">
          <div className="nav-group-title">Master Data</div>
          <NavLink to="/my-company" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>Company Settings</NavLink>
          <NavLink to="/clients" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>Client Companies</NavLink>
          <NavLink to="/accounts" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>Chart of Accounts</NavLink>
          <NavLink to="/vehicles" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>Vehicles</NavLink>
          <NavLink to="/drivers" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>Drivers</NavLink>
          <NavLink to="/locations" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>Billing Locations</NavLink>
          <NavLink to="/routes" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>Routes & Rates</NavLink>
        </div>
        {isSuperAdmin && (
          <div className="nav-group">
            <div className="nav-group-title">Admin</div>
            <NavLink to="/admin/users" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>Users & Backups</NavLink>
          </div>
        )}
      </nav>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Reports />} />
          <Route path="/trips" element={<TripManagement />} />
          <Route path="/diesel" element={<DieselManagement />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="/settlements" element={<VendorSettlement />} />
          <Route path="/payments" element={<PaymentVouchers />} />
          <Route path="/ledger" element={<LedgerDashboard />} />
          <Route path="/loans" element={<LoanTracking />} />
          <Route path="/reminders" element={<Reminders />} />
          <Route path="/print-invoice/:id" element={<Navigate to="/billing" replace />} />
          <Route path="/my-company" element={<MyCompanyProfile isSuperAdmin={isSuperAdmin} />} />
          <Route path="/clients" element={<ClientMaster />} />
          <Route path="/accounts" element={<AccountMaster />} />
          <Route path="/vehicles" element={<VehicleMaster />} />
          <Route path="/drivers" element={<DriverMaster />} />
          <Route path="/locations" element={<LocationMaster />} />
          <Route path="/routes" element={<RouteMaster />} />
          <Route path="/driver-settlements" element={<DriverSettlement />} />
          {isSuperAdmin && <Route path="/admin/users" element={<AdminUsers profiles={profiles} onCompaniesChanged={loadProfiles} />} />}
        </Routes>
      </main>
    </div>
  );
}
