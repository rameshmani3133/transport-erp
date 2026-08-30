import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

export default function InvoicePrint() {
    const { id } = useParams();
    const [invoice, setInvoice] = useState(null);
    const [myCompany, setMyCompany] = useState({});

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch specific invoice
                const invRes = await fetch('/api/invoices');
                if (invRes.ok) {
                    const data = await invRes.json();
                    const target = data.find(inv => inv.id.toString() === id);
                    setInvoice(target);
                }
                // Fetch dynamic company settings
                const compRes = await fetch('/api/my-company');
                if (compRes.ok) {
                    setMyCompany(await compRes.json());
                }
            } catch (err) {
                console.error("Error fetching print data", err);
            }
        };
        fetchData();
    }, [id]);

    if (!invoice) return <div style={{ padding: '20px' }}>Loading Document...</div>;

    const clientCompany = invoice.location?.company || {};
    const location = invoice.location || {};

    return (
        <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto', backgroundColor: 'white', color: 'black', fontFamily: 'Arial, sans-serif' }}>
            
            <style>
                {`
                @media print {
                    .no-print { display: none !important; }
                    body { background-color: white; }
                }
                table th, table td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 13px; }
                table th { background-color: #f1f5f9; font-weight: bold; color: #334155; }
                `}
            </style>

            <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
                <button onClick={() => window.print()} style={{ padding: '10px 20px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                    🖨️ Print / Save as PDF
                </button>
            </div>

            {/* DYNAMIC COMPANY HEADER */}
            <div style={{ borderBottom: '2px solid #1e293b', paddingBottom: '15px', marginBottom: '20px', textAlign: 'center' }}>
                <h1 style={{ margin: '0 0 5px 0', fontSize: '24px', textTransform: 'uppercase' }}>
                    {myCompany.companyName || '[YOUR LOGISTICS COMPANY NAME]'}
                </h1>
                <p style={{ margin: '0', fontSize: '13px', color: '#475569', whiteSpace: 'pre-wrap' }}>
                    {myCompany.address || 'Company Address Not Set'}
                </p>
                <p style={{ margin: '0', fontSize: '13px', color: '#475569', marginTop: '5px' }}>
                    <strong>GSTIN:</strong> {myCompany.gstNumber || 'N/A'} | <strong>PAN:</strong> {myCompany.panNumber || 'N/A'}
                </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px' }}>
                <div style={{ width: '45%' }}>
                    <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', textDecoration: 'underline' }}>BILLED TO:</h3>
                    <h2 style={{ margin: '0 0 5px 0', fontSize: '16px', textTransform: 'uppercase' }}>{clientCompany.companyName}</h2>
                    <p style={{ margin: '0 0 5px 0', fontSize: '13px', whiteSpace: 'pre-wrap' }}>{location.address}</p>
                    <p style={{ margin: '0', fontSize: '13px' }}><strong>GSTIN:</strong> {location.gstNumber || 'Unregistered'}</p>
                </div>
                <div style={{ width: '45%', border: '1px solid #cbd5e1', padding: '15px', borderRadius: '4px' }}>
                    <h2 style={{ margin: '0 0 10px 0', fontSize: '18px', color: '#1e293b' }}>TAX INVOICE</h2>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '13px' }}>
                        <strong>Invoice No:</strong> <span>{invoice.invoiceNo}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '13px' }}>
                        <strong>Date:</strong> <span>{new Date(invoice.date).toLocaleDateString()}</span>
                    </div>
                </div>
            </div>

            <h3 style={{ fontSize: '14px', marginBottom: '10px' }}>Trip Details</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px' }}>
                <thead>
                    <tr>
                        <th>S.No</th>
                        <th>Trip Date</th>
                        <th>Trip No</th>
                        <th>Vehicle</th>
                        <th>Route</th>
                        <th>Weight/Qty</th>
                        <th>Amount (₹)</th>
                    </tr>
                </thead>
                <tbody>
                    {invoice.trips?.map((trip, index) => (
                        <tr key={trip.id}>
                            <td>{index + 1}</td>
                            <td>{new Date(trip.date).toLocaleDateString()}</td>
                            <td>{trip.tripNo}</td>
                            <td>{trip.vehicle?.regNo || trip.vehicleId}</td>
                            <td>{trip.route?.fromLocation} - {trip.route?.toLocation}</td>
                            <td>{trip.billWeight} Tons</td>
                            <td style={{ textAlign: 'right' }}>{trip.totalClientBill?.toFixed(2)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                
                {/* DYNAMIC BANK DETAILS */}
                <div style={{ width: '50%' }}>
                    <h3 style={{ fontSize: '14px', textDecoration: 'underline', marginBottom: '10px' }}>Bank Details</h3>
                    <p style={{ margin: '0 0 5px 0', fontSize: '13px' }}><strong>Bank Name:</strong> {myCompany.bankName || 'Not Set'}</p>
                    <p style={{ margin: '0 0 5px 0', fontSize: '13px' }}><strong>A/C Number:</strong> {myCompany.accountNumber || 'Not Set'}</p>
                    <p style={{ margin: '0 0 5px 0', fontSize: '13px' }}><strong>IFSC Code:</strong> {myCompany.ifscCode || 'Not Set'}</p>
                </div>

                <div style={{ width: '45%' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                            <tr>
                                <td style={{ padding: '8px', border: '1px solid #cbd5e1' }}>Subtotal</td>
                                <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'right' }}>₹{invoice.subTotal?.toFixed(2)}</td>
                            </tr>
                            {invoice.cgst > 0 && (
                            <tr>
                                <td style={{ padding: '8px', border: '1px solid #cbd5e1' }}>CGST</td>
                                <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'right' }}>₹{invoice.cgst?.toFixed(2)}</td>
                            </tr>
                            )}
                            {invoice.sgst > 0 && (
                            <tr>
                                <td style={{ padding: '8px', border: '1px solid #cbd5e1' }}>SGST</td>
                                <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'right' }}>₹{invoice.sgst?.toFixed(2)}</td>
                            </tr>
                            )}
                            {invoice.igst > 0 && (
                            <tr>
                                <td style={{ padding: '8px', border: '1px solid #cbd5e1' }}>IGST</td>
                                <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'right' }}>₹{invoice.igst?.toFixed(2)}</td>
                            </tr>
                            )}
                            {invoice.otherCharges > 0 && (
                            <tr>
                                <td style={{ padding: '8px', border: '1px solid #cbd5e1' }}>Other Charges</td>
                                <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'right' }}>₹{invoice.otherCharges?.toFixed(2)}</td>
                            </tr>
                            )}
                            <tr style={{ backgroundColor: '#f1f5f9', fontWeight: 'bold' }}>
                                <td style={{ padding: '12px 8px', border: '1px solid #cbd5e1', fontSize: '15px' }}>GRAND TOTAL</td>
                                <td style={{ padding: '12px 8px', border: '1px solid #cbd5e1', textAlign: 'right', fontSize: '15px' }}>₹{invoice.grandTotal?.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* DYNAMIC SIGNATURE */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '70px' }}>
                <div style={{ textAlign: 'center', width: '280px' }}>
                    <div style={{ borderTop: '1px solid #334155', paddingTop: '10px', fontSize: '14px', fontWeight: 'bold' }}>
                        {myCompany.signatoryRole || 'Authorized Signatory'}
                    </div>
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>
                        For {myCompany.companyName || '[YOUR LOGISTICS COMPANY]'}
                    </span>
                </div>
            </div>

        </div>
    );
}