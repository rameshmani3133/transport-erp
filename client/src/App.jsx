import React, { useEffect, useState } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { getTenantKey, normalizeTenantKey, setTenantKey } from './tenant';

// Phase 1: Core Modules
import TripManagement from './pages/TripManagement';
import Billing from './pages/Billing';
import LocationMaster from './pages/LocationMaster';
import LedgerDashboard from './pages/LedgerDashboard';
import AccountMaster from './pages/AccountMaster';

// Phase 2: Master Data
import ClientMaster from './pages/ClientMaster';
import VehicleMaster from './pages/VehicleMaster';
import DriverMaster from './pages/DriverMaster';
import RouteMaster from './pages/RouteMaster';
import MyCompanyProfile from './pages/MyCompanyProfile'; // <-- Added Import

// Phase 3: Operations & Finance
import DieselManagement from './pages/DieselManagement';
import VendorSettlement from './pages/VendorSettlement';
import Reports from './pages/Reports';
import InvoicePrint from './pages/InvoicePrint';
import DriverSettlement from './pages/DriverSettlement';
import BillingMaster from './pages/BillingMaster';

export default function App() {
  const location = useLocation();
  const [tenant, setTenant] = useState(getTenantKey());
  const [profiles, setProfiles] = useState([]);
  const [customTenant, setCustomTenant] = useState('');
  
  // Hide the sidebar if the user is on the Print Invoice page
  const isPrintView = location.pathname.includes('/print-invoice');

  useEffect(() => {
    fetch('/api/my-company/all')
      .then(res => res.ok ? res.json() : [])
      .then(data => setProfiles(Array.isArray(data) ? data : []))
      .catch(() => setProfiles([]));
  }, [tenant]);

  const handleTenantChange = (value) => {
    const nextTenant = setTenantKey(value);
    setTenant(nextTenant);
    window.location.reload();
  };

  const handleCustomTenantSubmit = (event) => {
    event.preventDefault();
    if (!customTenant.trim()) return;
    handleTenantChange(normalizeTenantKey(customTenant));
  };

  return (
    <div className="app-shell">
      
      {/* Sidebar Navigation */}
      {!isPrintView && (
        <nav className="sidebar no-print">
          <div className="sidebar-header">
            Logistics ERP
          </div>
          <div className="tenant-panel">
            <label htmlFor="tenantSelect">Company</label>
            <select id="tenantSelect" value={tenant} onChange={(e) => handleTenantChange(e.target.value)}>
              <option value="default">Default Company</option>
              {profiles.map(profile => (
                <option key={profile.tenantKey} value={profile.tenantKey}>
                  {profile.companyName || profile.tenantKey}
                </option>
              ))}
            </select>
            <form onSubmit={handleCustomTenantSubmit} className="tenant-form">
              <input
                type="text"
                value={customTenant}
                onChange={(e) => setCustomTenant(e.target.value)}
                placeholder="New company key"
                aria-label="New company key"
              />
              <button type="submit">Use</button>
            </form>
          </div>

          <div className="nav-group">
            <div className="nav-group-title">Executive</div>
            <NavLink to="/" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Reports Dashboard</NavLink>
          </div>

          <div className="nav-group">
            <div className="nav-group-title">Operations</div>
            <NavLink to="/trips" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Trip Dispatch</NavLink>
            <NavLink to="/diesel" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Diesel Tracking</NavLink>
          </div>

          <div className="nav-group">
            <div className="nav-group-title">Finance & Billing</div>
            <NavLink to="/billing" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Client Invoicing</NavLink>
            <NavLink to="/settlements" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Vendor Settlements</NavLink>
            <NavLink to="/driver-settlements" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Driver Trip Sheets</NavLink>
            <NavLink to="/ledger" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Ledger Dashboard</NavLink>
          </div>

          <div className="nav-group">
            <div className="nav-group-title">Master Data</div>
            {/* Added Company Settings to the sidebar */}
            <NavLink to="/my-company" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Company Settings</NavLink>
            <NavLink to="/billing-master" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Billing Master</NavLink>
            <NavLink to="/clients" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Client Companies</NavLink>
            <NavLink to="/accounts" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Chart of Accounts</NavLink>
            <NavLink to="/vehicles" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Vehicles</NavLink>
            <NavLink to="/drivers" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Drivers</NavLink>
            <NavLink to="/locations" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Billing Locations</NavLink>
            <NavLink to="/routes" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Routes & Rates</NavLink>
          </div>
        </nav>
      )}

      {/* Main Content Router */}
      <main className={isPrintView ? "main-content print-mode" : "main-content"}>
        <Routes>
          {/* Executive & Reports */}
          <Route path="/" element={<Reports />} />
          
          {/* Operations */}
          <Route path="/trips" element={<TripManagement />} />
          <Route path="/diesel" element={<DieselManagement />} />
          
          {/* Finance */}
          <Route path="/billing" element={<Billing />} />
          <Route path="/settlements" element={<VendorSettlement />} />
          <Route path="/ledger" element={<LedgerDashboard />} />
          <Route path="/print-invoice/:id" element={<InvoicePrint />} />
          
          {/* Master Data Setup */}
          <Route path="/my-company" element={<MyCompanyProfile />} /> {/* <-- Added Route */}
          <Route path="/billing-master" element={<BillingMaster />} />
          <Route path="/clients" element={<ClientMaster />} />
          <Route path="/accounts" element={<AccountMaster />} />
          <Route path="/vehicles" element={<VehicleMaster />} />
          <Route path="/drivers" element={<DriverMaster />} />
          <Route path="/locations" element={<LocationMaster />} />
          <Route path="/routes" element={<RouteMaster />} />
          <Route path="/driver-settlements" element={<DriverSettlement />} />
        </Routes>
      </main>

    </div>
  );
}
