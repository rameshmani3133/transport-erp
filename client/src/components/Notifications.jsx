import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const NotificationContext = createContext(null);

export function useNotifications() {
    return useContext(NotificationContext);
}

export default function NotificationProvider({ children }) {
    const [snack, setSnack] = useState(null);
    const [confirmState, setConfirmState] = useState(null);

    const notify = useCallback((message, type = 'info') => {
        setSnack({ message: String(message || ''), type });
    }, []);

    const confirm = useCallback((message) => {
        return new Promise((resolve) => {
            setConfirmState({ message, resolve });
        });
    }, []);

    useEffect(() => {
        if (!snack) return undefined;
        const timer = setTimeout(() => setSnack(null), 3600);
        return () => clearTimeout(timer);
    }, [snack]);

    useEffect(() => {
        window.notifySnackbar = notify;
        window.confirmSnackbar = confirm;
        window.alert = (message) => notify(message, String(message || '').toLowerCase().includes('error') ? 'error' : 'info');
    }, [notify, confirm]);

    const answerConfirm = (value) => {
        if (confirmState?.resolve) confirmState.resolve(value);
        setConfirmState(null);
    };

    const value = useMemo(() => ({ notify, confirm }), [notify, confirm]);

    return (
        <NotificationContext.Provider value={value}>
            {children}
            {snack && (
                <div className={`snackbar snackbar-${snack.type}`} role="status">
                    {snack.message}
                </div>
            )}
            {confirmState && (
                <div className="confirm-backdrop" role="dialog" aria-modal="true">
                    <div className="confirm-dialog">
                        <p>{confirmState.message}</p>
                        <div className="confirm-actions">
                            <button type="button" className="btn-secondary" onClick={() => answerConfirm(false)}>Cancel</button>
                            <button type="button" className="btn-danger" onClick={() => answerConfirm(true)}>Continue</button>
                        </div>
                    </div>
                </div>
            )}
        </NotificationContext.Provider>
    );
}
