import React, { useEffect, useState, useMemo } from 'react';
import TableRecycleBin from './TableRecycleBin';

// Sort Icons
const Icons = {
    Search: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>,
    Up: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15"></polyline></svg>,
    Down: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"></polyline></svg>,
    Sort: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
};

export default function DataTable({ data, columns, title = "Records", enableColumnFilters = false, onFilteredDataChange, recycleBinType, onRecycleChanged, onNavigateRecord, activeRecordId, recordIdKey = 'id' }) {
    const [search, setSearch] = useState('');
    const [columnFilters, setColumnFilters] = useState({});
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    const [currentPage, setCurrentPage] = useState(1);
    const [recycleOpen, setRecycleOpen] = useState(false);
    const [queryId, setQueryId] = useState('');
    const [selectedRecordId, setSelectedRecordId] = useState(activeRecordId ?? null);
    const [queryMessage, setQueryMessage] = useState('');
    const rowsPerPage = 10;

    // Helper to get nested object values (e.g., 'company.companyName')
    const getNestedValue = (obj, path) => path.split('.').reduce((acc, part) => acc && acc[part], obj);
    const getCellValue = (row, col) => {
        if (col.filterValue) return col.filterValue(row);
        if (col.exportValue) return col.exportValue(row);
        return getNestedValue(row, col.key);
    };
    const getSortValue = (row, col) => {
        if (col?.sortValue) return col.sortValue(row);
        const rawValue = col ? getNestedValue(row, col.key) : undefined;
        return rawValue ?? (col ? getCellValue(row, col) : '');
    };
    const compareValues = (left, right) => {
        const leftNumber = typeof left === 'number' ? left : Number(left);
        const rightNumber = typeof right === 'number' ? right : Number(right);
        if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
        return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
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
            filtered = filtered
                .map((row, index) => ({ row, index }))
                .sort((left, right) => {
                    const leftValue = getSortValue(left.row, sortColumn);
                    const rightValue = getSortValue(right.row, sortColumn);
                    const leftEmpty = leftValue == null || leftValue === '';
                    const rightEmpty = rightValue == null || rightValue === '';
                    if (leftEmpty !== rightEmpty) return leftEmpty ? 1 : -1;
                    const result = compareValues(leftValue, rightValue);
                    if (result === 0) return left.index - right.index;
                    return sortConfig.direction === 'asc' ? result : -result;
                })
                .map(item => item.row);
        }
        return filtered;
    }, [data, search, columnFilters, sortConfig, columns, enableColumnFilters]);

    useEffect(() => {
        onFilteredDataChange?.(processedData);
    }, [processedData, onFilteredDataChange]);

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
        setCurrentPage(1);
    };

    // Pagination Logic
    const totalPages = Math.ceil(processedData.length / rowsPerPage) || 1;
    const currentData = processedData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
    const activeId = activeRecordId ?? selectedRecordId;
    const activeIndex = processedData.findIndex(row => String(getNestedValue(row, recordIdKey)) === String(activeId));

    useEffect(() => {
        if (activeRecordId == null) return;
        setSelectedRecordId(activeRecordId);
    }, [activeRecordId]);

    useEffect(() => {
        if (currentPage > totalPages) setCurrentPage(totalPages);
    }, [currentPage, totalPages]);

    const navigateToRecord = (row) => {
        if (!row) return;
        const recordId = getNestedValue(row, recordIdKey);
        const index = processedData.findIndex(item => String(getNestedValue(item, recordIdKey)) === String(recordId));
        setSelectedRecordId(recordId);
        setQueryId(String(recordId ?? ''));
        setQueryMessage(`${index + 1} of ${processedData.length} filtered records`);
        if (index >= 0) setCurrentPage(Math.floor(index / rowsPerPage) + 1);
        onNavigateRecord?.(row, { index, total: processedData.length, filteredData: processedData });
        if (onNavigateRecord) setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
    };

    const queryRecord = () => {
        const wanted = queryId.trim();
        if (!wanted) return setQueryMessage('Enter a record ID.');
        const row = processedData.find(item => String(getNestedValue(item, recordIdKey)) === wanted);
        if (!row) return setQueryMessage(`ID ${wanted} is not in the current filtered results.`);
        navigateToRecord(row);
    };

    const moveRecord = (direction) => {
        if (!processedData.length) return;
        const nextIndex = activeIndex < 0
            ? (direction > 0 ? 0 : processedData.length - 1)
            : activeIndex + direction;
        if (nextIndex < 0 || nextIndex >= processedData.length) return;
        navigateToRecord(processedData[nextIndex]);
    };

    return (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            
            {/* Header & Search Bar */}
            <div style={{ padding: '20px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                <h3 style={{ margin: 0, color: '#334155' }}>{title} ({processedData.length})</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            inputMode="numeric"
                            aria-label={`Query ${title} by ID`}
                            placeholder="Record ID"
                            value={queryId}
                            onChange={(event) => { setQueryId(event.target.value); setQueryMessage(''); }}
                            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); queryRecord(); } }}
                            style={{ width: '105px', padding: '8px 9px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                        />
                        <button type="button" onClick={queryRecord} style={{ padding: '8px 10px', border: '1px solid #2563eb', borderRadius: '6px', background: 'white', color: '#2563eb', cursor: 'pointer', fontWeight: 700 }}>Go</button>
                        <button type="button" onClick={() => moveRecord(-1)} disabled={!processedData.length || activeIndex === 0} style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', background: 'white', cursor: !processedData.length || activeIndex === 0 ? 'not-allowed' : 'pointer' }}>Previous record</button>
                        <button type="button" onClick={() => moveRecord(1)} disabled={!processedData.length || activeIndex === processedData.length - 1} style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', background: 'white', cursor: !processedData.length || activeIndex === processedData.length - 1 ? 'not-allowed' : 'pointer' }}>Next record</button>
                        {queryMessage && <span style={{ fontSize: '12px', color: queryMessage.includes('not in') || queryMessage.includes('Enter') ? '#dc2626' : '#475569' }}>{queryMessage}</span>}
                    </div>
                    {recycleBinType && (
                        <button type="button" onClick={() => setRecycleOpen(true)} style={{ padding: '8px 10px', border: '1px solid #dc2626', borderRadius: '6px', background: 'white', color: '#dc2626', cursor: 'pointer', fontWeight: 700 }}>
                            Recycle Bin
                        </button>
                    )}
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
                            <tr key={getNestedValue(row, recordIdKey) || idx} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: String(getNestedValue(row, recordIdKey)) === String(activeId) ? '#dbeafe' : 'transparent' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = String(getNestedValue(row, recordIdKey)) === String(activeId) ? '#dbeafe' : 'transparent'}>
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
            {recycleOpen && <TableRecycleBin type={recycleBinType} title={title} onClose={() => setRecycleOpen(false)} onChanged={onRecycleChanged} />}
        </div>
    );
}
