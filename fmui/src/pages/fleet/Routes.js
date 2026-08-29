import React, { useState, useEffect, useMemo } from 'react';
import api from '../../api/axios';
import AgGrid from '../../components/AgGrid';
import { toast } from 'react-toastify';
import locals from '../../utils/locals';
import { routeColumns } from '../../utils/columnDefs';
import RouteFormModal from './RouteFormModal';

const Routes = () => {
    const [routes, setRoutes] = useState([]);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchRoutes = async () => {
        try {
            const response = await api.get('/api/users/travel/route');
            setRoutes(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            console.error('Error fetching routes:', error);
            toast.error(locals.FetchError || 'Error fetching routes');
        }
    };

    useEffect(() => {
        fetchRoutes();
    }, []);

    const handleAdd = () => {
        setIsFormOpen(true);
    };

    const handleFormClose = () => {
        setIsFormOpen(false);
    };

    const filteredRoutes = useMemo(() => {
        if (!searchTerm) return routes;
        return routes.filter(r => 
            r.line_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            r.id?.toString().includes(searchTerm)
        );
    }, [routes, searchTerm]);

    return (
        <div className="max-w-7xl mx-auto space-y-6 text-slate-800 font-sans pb-10">
            
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-300">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Collection Routes</h1>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                            {routes.length} Active Routes
                        </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                        Manage factory tea leaf collection lines, route IDs, and driver dispatch corridors.
                    </p>
                </div>
                
                <button
                    onClick={handleAdd}
                    className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl shadow-sm hover:shadow-md transition-all text-xs font-semibold"
                >
                    <span>+ Add New Route</span>
                </button>
            </div>

            {/* KPI Ribbon */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <span className="text-xs text-slate-500 font-semibold uppercase">Total Routes</span>
                        <div className="text-xl font-bold text-slate-900 mt-0.5">{routes.length} Lines</div>
                    </div>
                    <div className="p-2.5 rounded-xl text-lg bg-purple-50 text-purple-600">
                        🗺️
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <span className="text-xs text-slate-500 font-semibold uppercase">Network Status</span>
                        <div className="text-xl font-bold text-emerald-600 mt-0.5">All Open</div>
                    </div>
                    <div className="p-2.5 rounded-xl text-lg bg-emerald-50 text-emerald-600">
                        ✓
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <span className="text-xs text-slate-500 font-semibold uppercase">Search Route</span>
                        <div className="text-xs text-slate-400 mt-1">{filteredRoutes.length} matching routes</div>
                    </div>
                    <input
                        type="text"
                        placeholder="Search route name..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400 w-36"
                    />
                </div>
            </div>

            {/* Main Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4">
                <AgGrid 
                    rowData={filteredRoutes} 
                    columnDefProp={routeColumns} 
                    fileName="collection-routes"
                />
            </div>

            <RouteFormModal
                isOpen={isFormOpen}
                onClose={handleFormClose}
                onSuccess={fetchRoutes}
            />
        </div>
    );
};

export default Routes;
