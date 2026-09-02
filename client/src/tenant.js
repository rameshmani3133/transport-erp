export function normalizeTenantKey(value) {
    return String(value || 'default').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'default';
}

export function getTenantKey() {
    return normalizeTenantKey(localStorage.getItem('tenantKey') || 'default');
}

export function setTenantKey(value) {
    const key = normalizeTenantKey(value);
    localStorage.setItem('tenantKey', key);
    window.dispatchEvent(new CustomEvent('tenant-changed', { detail: key }));
    return key;
}

export function getAuthToken() {
    return localStorage.getItem('authToken') || '';
}

export function setAuthSession(token, user) {
    localStorage.setItem('authToken', token);
    localStorage.setItem('authUser', JSON.stringify(user));
    const currentTenant = getTenantKey();
    const companies = Array.isArray(user?.companies) ? user.companies.map(normalizeTenantKey) : [];
    const company = user?.role === 'SUPERADMIN' || companies.includes(currentTenant)
        ? currentTenant
        : companies[0] || 'default';
    return setTenantKey(company);
}

export function getAuthUser() {
    try {
        return JSON.parse(localStorage.getItem('authUser') || 'null');
    } catch {
        return null;
    }
}

export function clearAuthSession() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
}

export function installTenantFetch() {
    if (window.__tenantFetchInstalled) return;
    const nativeFetch = window.fetch.bind(window);

    window.fetch = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : input?.url;
        if (!url || !url.startsWith('/api')) {
            return nativeFetch(input, init);
        }

        const headers = new Headers(init.headers || {});
        headers.set('X-Tenant-Key', getTenantKey());
        const token = getAuthToken();
        if (token) headers.set('Authorization', `Bearer ${token}`);
        const response = await nativeFetch(input, { ...init, headers });
        if (response.status === 401 && !url.startsWith('/api/auth/login')) {
            clearAuthSession();
            window.dispatchEvent(new Event('auth-expired'));
        }
        return response;
    };

    window.__tenantFetchInstalled = true;
}
