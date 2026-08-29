import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import locals from '../../utils/locals';
import { boughtLeafColumns } from '../../utils/columnDefs';
import AgGrid from '../../components/AgGrid';

const BoughtLeaf = () => {
    const [data, setData] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchData = async () => {
        try {
            const response = await api.get('/api/bought-leaf');
            setData(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            console.error('Error fetching bought leaf data:', error);
            toast.error('Failed to fetch bought leaf records');
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const totalNetWeight = data.reduce((acc, row) => acc + (parseFloat(row.net_weight) || 0), 0);
    const totalGrossWeight = data.reduce((acc, row) => acc + (parseFloat(row.gross_weight) || 0), 0);
    const totalDeductions = data.reduce((acc, row) => acc + (parseFloat(row.water_deduction) || 0) + (parseFloat(row.tare_deduction) || 0), 0);

    const filteredData = useMemo(() => {
        if (!searchTerm) return data;
        const term = searchTerm.toLowerCase();
        return data.filter(d => 
            (d.supplier_code && d.supplier_code.toLowerCase().includes(term)) ||
            (d.supplier_name && d.supplier_name.toLowerCase().includes(term)) ||
            (d.date && d.date.toString().includes(term))
        );
    }, [data, searchTerm]);

    return (
        <div className="max-w-7xl mx-auto space-y-6 text-slate-800 font-sans pb-10">
            
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-300">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Bought Leaf Collections</h1>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            {data.length} Batches Recorded
                        </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                        {locals.BoughtLeafSummaryDesc || 'View daily summary of bought leaf collections, deductions, and supplier yields.'}
                    </p>
                </div>

                <Link
                    to="/bought-leaf/create"
                    className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl shadow-sm hover:shadow-md transition-all text-xs font-semibold"
                >
                    <span>+ Record New Intake</span>
                </Link>
            </div>

            {/* KPI Ribbon */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <span className="text-xs text-slate-500 font-semibold uppercase">Total Net Yield</span>
                        <div className="text-xl font-bold text-emerald-700 mt-0.5">{totalNetWeight.toLocaleString()} kg</div>
                    </div>
                    <div className="p-2.5 rounded-xl text-lg bg-emerald-50 text-emerald-600">
                        🍃
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <span className="text-xs text-slate-500 font-semibold uppercase">Gross vs Deductions</span>
                        <div className="text-xs font-bold text-slate-800 mt-1">
                            Gross: {totalGrossWeight.toLocaleString()} kg
                        </div>
                        <div className="text-[11px] text-amber-600 font-semibold">
                            Deductions: -{totalDeductions.toLocaleString()} kg
                        </div>
                    </div>
                    <div className="p-2.5 rounded-xl text-lg bg-slate-100 text-slate-700">
                        ⚖️
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <span className="text-xs text-slate-500 font-semibold uppercase">Filter Records</span>
                        <div className="text-xs text-slate-400 mt-1">{filteredData.length} records matching</div>
                    </div>
                    <input
                        type="text"
                        placeholder="Search supplier..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400 w-36"
                    />
                </div>
            </div>

            {/* Main Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4">
                <AgGrid
                    rowData={filteredData}
                    columnDefProp={boughtLeafColumns}
                    fileName="bought-leaf-records"
                />
            </div>
        </div>
    );
};

export default BoughtLeaf;
