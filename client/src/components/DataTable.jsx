import React, { useState, useMemo } from 'react';

// Sort Icons
const Icons = {
    Search: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>,
    Up: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15"></polyline></svg>,
    Down: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>,
    Sort: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
};

export default function DataTable({ data, columns, title = "Records", enableColumnFilters = false }) {
    const [search, setSearch] = useState('');
    const [columnFilters, setColumnFilters] = useState({});
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    const [currentPage, setCurrentPage] = useState(1);
    const rowsPerPage = 10;

    // Helper to get nested object values (e.g., 'company.companyName')
    const getNestedValue = (obj, path) => path.split('.').reduce((acc, part) => acc && acc[part], obj);
    const getCellValue = (row, col) => {
        if (col.filterValue) return col.filterValue(row);
        if (col.exportValue) return col.exportValue(row);
        return getNestedValue(row, col.key);
    };

    // Filter and Sort Engine
    const processedData = useMemo(() => {
        let filtered = [...data];

        // 1. Global Search Filter
        if (search) {
            const lowerSearch = search.toLowerCase();
            filtered = filtered.filter(row => {
                return columns.some(col => {
                    if (col.key === 'actions') return false; // Don't search action buttons
                    const val = getCellValue(row, col);
                    return String(val || '').toLowerCase().includes(lowerSearch);
                });
            });
        }

        // 2. Per-column Header Filters
        if (enableColumnFilters) {
            const activeFilters = Object.entries(columnFilters).filter(([, value]) => String(value || '').trim());
            if (activeFilters.length) {
                filtered = filtered.filter(row => activeFilters.every(([key, value]) => {
                    const col = columns.find(item => item.key === key);
                    if (!col) return true;
                    return String(getCellValue(row, col) || '').toLowerCase().includes(String(value).toLowerCase());
                }));
            }
        }

        // 3. Column Sort
        if (sortConfig.key) {
            const sortColumn = columns.find(col => col.key === sortConfig.key);
            filtered.sort((a, b) => {
                const aVal = sortColumn ? getCellValue(a, sortColumn) || '' : getNestedValue(a, sortConfig.key) || '';
                const bVal = sortColumn ? getCellValue(b, sortColumn) || '' : getNestedValue(b, sortConfig.key) || '';
                
                // Handle numbers vs strings
                if (!isNaN(aVal) && !isNaN(bVal)) {
                    return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
                }
                
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return filtered;
    }, [data, search, columnFilters, sortConfig, columns, enableColumnFilters]);

    const updateColumnFilter = (key, value) => {
        setColumnFilters(prev => ({ ...prev, [key]: value }));
        setCurrentPage(1);
    };

    const clearColumnFilters = () => {
        setColumnFilters({});
        setCurrentPage(1);
    };

    const hasColumnFilters = Object.values(columnFilters).some(value => String(value || '').trim());

    const handleSort = (key) => {
        if (key === 'actions') return;
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };

    // Pagination Logic
    const totalPages = Math.ceil(processedData.length / rowsPerPage) || 1;
    const currentData = processedData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    return (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            
            {/* Header & Search Bar */}
            <div style={{ padding: '20px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                <h3 style={{ margin: 0, color: '#334155' }}>{title} ({processedData.length})</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {enableColumnFilters && hasColumnFilters && (
                        <button type="button" onClick={clearColumnFilters} style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', background: 'white', color: '#475569', cursor: 'pointer', fontWeight: 700 }}>
                            Clear filters
                        </button>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 12px', minWidth: '250px' }}>
                        <Icons.Search />
                        <input 
                            type="text" 
                            placeholder="Search all columns..." 
                            value={search} 
                            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} 
                            style={{ border: 'none', outline: 'none', marginLeft: '10px', width: '100%', fontSize: '14px' }} 
                        />
                    </div>
                </div>
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                            {columns.map((col, idx) => (
                                <th key={idx} onClick={() => handleSort(col.key)} 
                                    style={{ padding: '16px', color: '#64748b', fontSize: '12px', textTransform: 'uppercase', cursor: col.key !== 'actions' ? 'pointer' : 'default', userSelect: 'none' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        {col.header}
                                        {col.key !== 'actions' && (
                                            sortConfig.key === col.key 
                                                ? (sortConfig.direction === 'asc' ? <Icons.Up /> : <Icons.Down />)
                                                : <Icons.Sort />
                                        )}
                                    </div>
                                </th>
                            ))}
                        </tr>
                        {enableColumnFilters && (
                            <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                                {columns.map((col, idx) => (
                                    <th key={`filter-${idx}`} style={{ padding: '8px 12px' }}>
                                        {col.key !== 'actions' && (
                                            <input
                                                type="text"
                                                aria-label={`Filter ${col.header}`}
                                                placeholder={`Filter ${col.header}`}
                                                value={columnFilters[col.key] || ''}
                                                onClick={(event) => event.stopPropagation()}
                                                onChange={(event) => updateColumnFilter(col.key, event.target.value)}
                                                style={{ width: '100%', minWidth: '110px', padding: '7px 8px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', fontWeight: 500, textTransform: 'none', color: '#0f172a', background: 'white' }}
                                            />
                                        )}
                                    </th>
                                ))}
                            </tr>
                        )}
                    </thead>
                    <tbody>
                        {currentData.map((row, idx) => (
                            <tr key={row.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                {columns.map((col, colIdx) => (
                                    <td key={colIdx} style={{ padding: '16px', fontSize: '14px', color: '#0f172a' }}>
                                        {col.render ? col.render(row) : getNestedValue(row, col.key)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                        {currentData.length === 0 && (
                            <tr><td colSpan={columns.length} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No records found matching your search.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination controls */}
            <div style={{ padding: '15px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc' }}>
                <span style={{ fontSize: '13px', color: '#64748b' }}>Page {currentPage} of {totalPages}</span>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: '4px', backgroundColor: currentPage === 1 ? '#f1f5f9' : 'white', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}>Previous</button>
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} style={{ padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: '4px', backgroundColor: currentPage === totalPages ? '#f1f5f9' : 'white', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}>Next</button>
                </div>
            </div>
        </div>
    );
}
