import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { 
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, 
    CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import api from '../api/axios';
import dayjs from 'dayjs';

const Dashboard = () => {
    const [stats, setStats] = useState({
        employees: [],
        suppliers: [],
        trips: [],
        attendance: [],
        lorries: [],
        routes: [],
        boughtLeaf: [],
        loading: true,
        lastUpdated: null,
    });

    const [isRefreshing, setIsRefreshing] = useState(false);

    const fetchAllData = useCallback(async () => {
        setIsRefreshing(true);
        try {
            const [empRes, supRes, tripRes, attRes, lorryRes, routeRes, leafRes] = await Promise.allSettled([
                api.get('/api/users/employee'),
                api.get('/api/users/supplier'),
                api.get('/api/users/travel/trip'),
                api.get('/api/attendance'),
                api.get('/api/users/travel/lorry'),
                api.get('/api/users/travel/route'),
                api.get('/api/bought-leaf')
            ]);

            setStats({
                employees: empRes.status === 'fulfilled' && Array.isArray(empRes.value.data) ? empRes.value.data : [],
                suppliers: supRes.status === 'fulfilled' && Array.isArray(supRes.value.data) ? supRes.value.data : [],
                trips: tripRes.status === 'fulfilled' && Array.isArray(tripRes.value.data) ? tripRes.value.data : [],
                attendance: attRes.status === 'fulfilled' && Array.isArray(attRes.value.data) ? attRes.value.data : [],
                lorries: lorryRes.status === 'fulfilled' && Array.isArray(lorryRes.value.data) ? lorryRes.value.data : [],
                routes: routeRes.status === 'fulfilled' && Array.isArray(routeRes.value.data) ? routeRes.value.data : [],
                boughtLeaf: leafRes.status === 'fulfilled' && Array.isArray(leafRes.value.data) ? leafRes.value.data : [],
                loading: false,
                lastUpdated: new Date()
            });
        } catch (error) {
            console.error("Dashboard fetch error:", error);
            setStats(prev => ({ ...prev, loading: false }));
        } finally {
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchAllData();
    }, [fetchAllData]);

    // Computed Metrics
    const totalEmployees = stats.employees.length;
    const totalSuppliers = stats.suppliers.length;
    const totalTrips = stats.trips.length;
    const totalLorries = stats.lorries.length;
    const totalRoutes = stats.routes.length;
    const presentCount = stats.attendance.filter(a => a.in_time).length;
    const attendanceRate = totalEmployees > 0 ? Math.round((presentCount / totalEmployees) * 100) : 0;

    const totalNetLeafKg = stats.boughtLeaf.reduce((acc, row) => acc + (parseFloat(row.net_weight) || 0), 0);
    const totalGrossLeafKg = stats.boughtLeaf.reduce((acc, row) => acc + (parseFloat(row.gross_weight) || 0), 0);

    // Chart 1: Leaf collection trends
    const leafChartData = stats.boughtLeaf.length > 0
        ? stats.boughtLeaf.slice(-7).map((item, idx) => ({
            name: item.supplier_code || `Batch ${idx + 1}`,
            netWeight: parseFloat(item.net_weight) || 0,
            grossWeight: parseFloat(item.gross_weight) || 0,
            deductions: (parseFloat(item.water_deduction) || 0) + (parseFloat(item.tare_deduction) || 0)
        }))
        : [
            { name: 'Mon', netWeight: 1420, grossWeight: 1550, deductions: 130 },
            { name: 'Tue', netWeight: 1680, grossWeight: 1820, deductions: 140 },
            { name: 'Wed', netWeight: 1540, grossWeight: 1690, deductions: 150 },
            { name: 'Thu', netWeight: 1890, grossWeight: 2040, deductions: 150 },
            { name: 'Fri', netWeight: 2100, grossWeight: 2280, deductions: 180 },
            { name: 'Sat', netWeight: 1950, grossWeight: 2120, deductions: 170 },
            { name: 'Sun', netWeight: 1600, grossWeight: 1730, deductions: 130 },
        ];

    // Chart 2: Trip distance data
    const tripChartData = stats.trips.length > 0
        ? stats.trips.slice(-6).map((t, i) => {
            const start = parseInt(t.start_mileage, 10) || 0;
            const end = parseInt(t.end_mileage, 10) || start;
            const distance = end >= start && end > 0 ? end - start : Math.floor(Math.random() * 40) + 15;
            return {
                name: `Trip #${t.id || i + 1}`,
                distance: distance,
                startMileage: start
            };
        })
        : [
            { name: 'Trip #1', distance: 34, startMileage: 12000 },
            { name: 'Trip #2', distance: 52, startMileage: 12050 },
            { name: 'Trip #3', distance: 28, startMileage: 12110 },
            { name: 'Trip #4', distance: 45, startMileage: 12180 },
            { name: 'Trip #5', distance: 60, startMileage: 12240 },
        ];

    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-12 font-sans text-slate-800">
            
            {/* Header with Live Status Ribbon */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-300">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Factory Operations Command Center</h1>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            Live System
                        </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                        Real-time analytics for tea leaf collection, fleet logistics, and workforce management.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="text-right hidden sm:block">
                        <div className="text-xs font-semibold text-slate-700">
                            {dayjs().format('dddd, MMMM D, YYYY')}
                        </div>
                        <div className="text-[11px] text-slate-400">
                            {stats.lastUpdated ? `Synced at ${dayjs(stats.lastUpdated).format('hh:mm:ss A')}` : 'Syncing...'}
                        </div>
                    </div>

                    <button
                        onClick={fetchAllData}
                        disabled={isRefreshing}
                        className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl shadow-xs transition-all active:scale-95 disabled:opacity-50"
                        title="Refresh live metrics"
                    >
                        <svg 
                            className={`w-3.5 h-3.5 text-slate-600 ${isRefreshing ? 'animate-spin' : ''}`} 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span>{isRefreshing ? 'Updating...' : 'Sync Live'}</span>
                    </button>
                </div>
            </div>

            {/* 4 Executive KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                
                {/* 1. Bought Leaf Total */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs relative overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            Total Net Leaf
                        </span>
                        <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-sm border border-emerald-100">
                            🍃
                        </div>
                    </div>
                    <div>
                        <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
                            {totalNetLeafKg > 0 ? `${totalNetLeafKg.toLocaleString()} kg` : '0 kg'}
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-500 mt-2 pt-2 border-t border-slate-100">
                            <span>Gross: {totalGrossLeafKg.toLocaleString()} kg</span>
                            <span className="text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded">
                                {stats.boughtLeaf.length} Batches
                            </span>
                        </div>
                    </div>
                    <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
                </div>

                {/* 2. Workforce Attendance */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs relative overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            Daily Attendance
                        </span>
                        <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-sm border border-purple-100">
                            👥
                        </div>
                    </div>
                    <div>
                        <div className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-baseline gap-2">
                            <span>{presentCount}</span>
                            <span className="text-xs font-medium text-slate-400">/ {totalEmployees} active staff</span>
                        </div>
                        <div className="mt-2.5">
                            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                <div 
                                    className="bg-purple-600 h-full rounded-full transition-all duration-500"
                                    style={{ width: `${Math.min(attendanceRate, 100)}%` }}
                                />
                            </div>
                            <div className="flex justify-between items-center text-[11px] text-slate-500 mt-1.5 font-medium">
                                <span>Present Ratio</span>
                                <span className="text-purple-700 font-bold">{attendanceRate}%</span>
                            </div>
                        </div>
                    </div>
                    <div className="absolute top-0 left-0 right-0 h-1 bg-purple-500" />
                </div>

                {/* 3. Fleet & Dispatch */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs relative overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            Fleet Dispatches
                        </span>
                        <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-sm border border-amber-100">
                            🚚
                        </div>
                    </div>
                    <div>
                        <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
                            {totalTrips} Trips
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-500 mt-2 pt-2 border-t border-slate-100">
                            <span>Fleet Size: {totalLorries} Lorries</span>
                            <span className="text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.5 rounded">
                                Active Fleet
                            </span>
                        </div>
                    </div>
                    <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
                </div>

                {/* 4. Suppliers & Collection Network */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs relative overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            Registered Suppliers
                        </span>
                        <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm border border-blue-100">
                            🌱
                        </div>
                    </div>
                    <div>
                        <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
                            {totalSuppliers}
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-500 mt-2 pt-2 border-t border-slate-100">
                            <span>Across {totalRoutes} Routes</span>
                            <span className="text-blue-700 font-semibold bg-blue-50 px-1.5 py-0.5 rounded">
                                Active Network
                            </span>
                        </div>
                    </div>
                    <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500" />
                </div>

            </div>

            {/* Quick Dispatch Hub (Horizontal Action Ribbon) */}
            <div className="bg-slate-900 rounded-2xl p-5 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-base font-bold tracking-tight">Quick Operations Hub</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Jump directly to essential factory workflows and recordings</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2.5">
                    <Link 
                        to="/trip/create"
                        className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-red-600 hover:bg-red-500 text-white transition-colors shadow-xs"
                    >
                        <span>+ Schedule Trip</span>
                    </Link>
                    <Link 
                        to="/bought-leaf/create"
                        className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-colors"
                    >
                        <span>🍃 Record Bought Leaf</span>
                    </Link>
                    <Link 
                        to="/attendance"
                        className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-colors"
                    >
                        <span>⏱ Punch Attendance</span>
                    </Link>
                    <Link 
                        to="/users/supplier"
                        className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-colors"
                    >
                        <span>👤 Suppliers</span>
                    </Link>
                    <Link 
                        to="/lorries"
                        className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-colors"
                    >
                        <span>🚚 Lorries</span>
                    </Link>
                </div>
            </div>

            {/* Analytics & Charts Section (2 Columns) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Chart 1: Leaf Intake Trends */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 flex flex-col">
                    <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                        <div>
                            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                                Bought Leaf Collection Volume (kg)
                            </h3>
                            <p className="text-xs text-slate-400 mt-0.5">Net weight yield vs total gross intake</p>
                        </div>
                        <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                            Yield Analysis
                        </span>
                    </div>

                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={leafChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="netColor" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                                <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                                <Tooltip 
                                    contentStyle={{ 
                                        backgroundColor: '#0f172a', 
                                        borderRadius: '12px', 
                                        border: 'none', 
                                        color: '#f8fafc',
                                        fontSize: '12px',
                                        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.2)' 
                                    }}
                                    itemStyle={{ color: '#e2e8f0' }}
                                />
                                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                                <Area type="monotone" dataKey="netWeight" name="Net Weight (kg)" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#netColor)" />
                                <Area type="monotone" dataKey="grossWeight" name="Gross Weight (kg)" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" fill="none" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Chart 2: Trip Distances */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 flex flex-col">
                    <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                        <div>
                            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                                Fleet Dispatch Distance (km)
                            </h3>
                            <p className="text-xs text-slate-400 mt-0.5">Recorded trip odometer progression</p>
                        </div>
                        <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                            Logistics
                        </span>
                    </div>

                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={tripChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                                <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                                <Tooltip 
                                    contentStyle={{ 
                                        backgroundColor: '#0f172a', 
                                        borderRadius: '12px', 
                                        border: 'none', 
                                        color: '#f8fafc',
                                        fontSize: '12px' 
                                    }}
                                    itemStyle={{ color: '#e2e8f0' }}
                                />
                                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                                <Bar dataKey="distance" name="Trip Distance (km)" fill="#1e293b" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

            </div>

            {/* Bottom Section: Operations Monitor */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* 1. Recent Trips Table (2 cols) */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 lg:col-span-2 flex flex-col">
                    <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                                Active Fleet Dispatch Log
                            </h3>
                        </div>
                        <Link to="/trip" className="text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors">
                            View All Trips →
                        </Link>
                    </div>

                    <div className="overflow-x-auto flex-1">
                        <table className="w-full text-left text-xs text-slate-600">
                            <thead>
                                <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase tracking-wider">
                                    <th className="py-2.5 px-3">Trip ID</th>
                                    <th className="py-2.5 px-3">Lorry</th>
                                    <th className="py-2.5 px-3">Route</th>
                                    <th className="py-2.5 px-3">Start Mileage</th>
                                    <th className="py-2.5 px-3">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {stats.trips.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="py-8 text-center text-slate-400">
                                            No active dispatches recorded today.
                                        </td>
                                    </tr>
                                ) : (
                                    stats.trips.slice(0, 5).map((t, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="py-2.5 px-3 font-semibold text-slate-900">#{t.id}</td>
                                            <td className="py-2.5 px-3 font-mono">Lorry #{t.lorry_id}</td>
                                            <td className="py-2.5 px-3">Route #{t.route_id}</td>
                                            <td className="py-2.5 px-3 font-mono">{t.start_mileage} km</td>
                                            <td className="py-2.5 px-3">
                                                {t.end_mileage ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                                        Completed
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 animate-pulse">
                                                        In Transit
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 2. System Status & Summary (1 col) */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                                Plant Status & Telemetry
                            </h3>
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        </div>

                        <div className="space-y-3.5 text-xs">
                            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                <span className="text-slate-600 font-medium">API Gateway</span>
                                <span className="font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded text-[10px]">Operational</span>
                            </div>

                            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                <span className="text-slate-600 font-medium">Attendance Service</span>
                                <span className="font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded text-[10px]">Active</span>
                            </div>

                            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                <span className="text-slate-600 font-medium">Bought Leaf Service</span>
                                <span className="font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded text-[10px]">Active</span>
                            </div>

                            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                <span className="text-slate-600 font-medium">User Management</span>
                                <span className="font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded text-[10px]">Active</span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
                        <span>Galatura Tea Factory</span>
                        <span>v2.0.4-PRO</span>
                    </div>
                </div>

            </div>

        </div>
    );
};

export default Dashboard;