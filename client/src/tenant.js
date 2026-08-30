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

export function installTenantFetch() {
    if (window.__tenantFetchInstalled) return;
    const nativeFetch = window.fetch.bind(window);

    window.fetch = (input, init = {}) => {
        const url = typeof input === 'string' ? input : input?.url;
        if (!url || !url.startsWith('/api')) {
            return nativeFetch(input, init);
        }

        const headers = new Headers(init.headers || {});
        headers.set('X-Tenant-Key', getTenantKey());
        return nativeFetch(input, { ...init, headers });
    };

    window.__tenantFetchInstalled = true;
}
