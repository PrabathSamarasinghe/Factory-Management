import React, { useState, useEffect, useMemo } from 'react';
import api from '../../api/axios';
import AgGrid from '../../components/AgGrid';
import { toast } from 'react-toastify';
import locals from '../../utils/locals';
import { lorryColumns } from '../../utils/columnDefs';
import LorryFormModal from './LorryFormModal';

const Lorries = () => {
    const [lorries, setLorries] = useState([]);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editData, setEditData] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchLorries = async () => {
        try {
            const response = await api.get('/api/users/travel/lorry');
            setLorries(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            console.error('Error fetching lorries:', error);
            toast.error(locals.FetchError || 'Error fetching lorries');
        }
    };

    useEffect(() => {
        fetchLorries();
    }, []);

    const handleAdd = () => {
        setEditData(null);
        setIsFormOpen(true);
    };

    const handleEdit = (rowData) => {
        setEditData(rowData);
        setIsFormOpen(true);
    };

    const handleDelete = async (rowData) => {
        if (window.confirm(`Are you sure you want to delete lorry ${rowData.lorry_number}?`)) {
            try {
                await api.delete(`/api/users/travel/lorry/${rowData.id}`);
                toast.success('Lorry deleted successfully');
                fetchLorries();
            } catch (error) {
                console.error('Error deleting lorry:', error);
                toast.error('Failed to delete lorry');
            }
        }
    };

    const handleFormClose = () => {
        setIsFormOpen(false);
        setEditData(null);
    };

    // Filtered Lorries
    const filteredLorries = useMemo(() => {
        if (!searchTerm) return lorries;
        return lorries.filter(l => 
            l.lorry_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            l.id?.toString().includes(searchTerm)
        );
    }, [lorries, searchTerm]);

    const totalMileage = lorries.reduce((acc, l) => acc + (parseInt(l.mileage, 10) || 0), 0);

    return (
        <div className="max-w-7xl mx-auto space-y-6 text-slate-800 font-sans pb-10">
            
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-300">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Factory Fleet & Lorries</h1>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                            {lorries.length} Registered Lorries
                        </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                        Manage factory transport vehicles, license plates, and odometer tracking.
                    </p>
                </div>
                
                <button
                    onClick={handleAdd}
                    className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl shadow-sm hover:shadow-md transition-all text-xs font-semibold"
                >
                    <span>+ Add New Lorry</span>
                </button>
            </div>

            {/* KPI Ribbon */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <span className="text-xs text-slate-500 font-semibold uppercase">Total Fleet Size</span>
                        <div className="text-xl font-bold text-slate-900 mt-0.5">{lorries.length} Vehicles</div>
                    </div>
                    <div className="p-2.5 rounded-xl text-lg bg-amber-50 text-amber-600">
                        🚚
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <span className="text-xs text-slate-500 font-semibold uppercase">Fleet Total Mileage</span>
                        <div className="text-xl font-bold text-slate-900 mt-0.5">{totalMileage.toLocaleString()} km</div>
                    </div>
                    <div className="p-2.5 rounded-xl text-lg bg-slate-100 text-slate-700">
                        📍
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <span className="text-xs text-slate-500 font-semibold uppercase">Search Vehicle</span>
                        <div className="text-xs text-slate-400 mt-1">{filteredLorries.length} lorries found</div>
                    </div>
                    <input
                        type="text"
                        placeholder="Search number..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400 w-32"
                    />
                </div>
            </div>

            {/* Main Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4">
                <AgGrid 
                    rowData={filteredLorries} 
                    columnDefProp={lorryColumns} 
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    fileName="lorry-fleet"
                />
            </div>

            <LorryFormModal
                isOpen={isFormOpen}
                onClose={handleFormClose}
                editData={editData}
                onSuccess={fetchLorries}
            />
        </div>
    );
};

export default Lorries;
