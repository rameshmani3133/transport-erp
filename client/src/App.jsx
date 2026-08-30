import React, { useEffect, useState } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { clearAuthSession, getAuthUser, getTenantKey, setAuthSession, setTenantKey } from './tenant';

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
import InvoicePrint from './pages/InvoicePrint';
import DriverSettlement from './pages/DriverSettlement';
import BillingMaster from './pages/BillingMaster';
import AdminUsers from './pages/AdminUsers';

function dedupeProfiles(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter(item => {
    if (!item?.tenantKey || seen.has(item.tenantKey)) return false;
    seen.add(item.tenantKey);
    return true;
  });
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
  const location = useLocation();
  const [user, setUser] = useState(getAuthUser());
  const [tenant, setTenant] = useState(getTenantKey());
  const [profiles, setProfiles] = useState([]);
  const isSuperAdmin = user?.role === 'SUPERADMIN';
  const isPrintView = location.pathname.includes('/print-invoice');

  useEffect(() => {
    if (!user) return;
    fetch('/api/auth/me')
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => setUser(data.user))
      .catch(() => { clearAuthSession(); setUser(null); });
  }, []);

  const loadProfiles = async () => {
    const res = await fetch('/api/my-company/all');
    const data = res.ok ? await res.json() : [];
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

  if (!user) return <LoginScreen onLogin={setUser} />;

  return (
    <div className="app-shell">
      {!isPrintView && (
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
                  {profile.companyName || profile.tenantKey}
                </option>
              ))}
            </select>
          </div>

          <div className="nav-group">
            <div className="nav-group-title">Executive</div>
            <NavLink to="/" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>Reports Dashboard</NavLink>
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
            <NavLink to="/ledger" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>Ledger Dashboard</NavLink>
          </div>
          <div className="nav-group">
            <div className="nav-group-title">Master Data</div>
            <NavLink to="/my-company" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>Company Settings</NavLink>
            <NavLink to="/billing-master" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}>Billing Master</NavLink>
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
      )}

      <main className={isPrintView ? 'main-content print-mode' : 'main-content'}>
        <Routes>
          <Route path="/" element={<Reports />} />
          <Route path="/trips" element={<TripManagement />} />
          <Route path="/diesel" element={<DieselManagement />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="/settlements" element={<VendorSettlement />} />
          <Route path="/ledger" element={<LedgerDashboard />} />
          <Route path="/print-invoice/:id" element={<InvoicePrint />} />
          <Route path="/my-company" element={<MyCompanyProfile isSuperAdmin={isSuperAdmin} />} />
          <Route path="/billing-master" element={<BillingMaster />} />
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
