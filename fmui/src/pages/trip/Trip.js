import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import AgGrid from '../../components/AgGrid';
import Modal from '../../components/Modal';
import TextInput from '../../components/TextInput';
import Button from '../../components/Button';
import { toast } from 'react-toastify';
import locals from '../../utils/locals';
import { tripColumns } from '../../utils/columnDefs';

const Trip = () => {
    const [tripData, setTripData] = useState([]);
    const [selectedTrip, setSelectedTrip] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [endMileage, setEndMileage] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'IN_TRANSIT' | 'COMPLETED'
    const [searchTerm, setSearchTerm] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const getTripData = async () => {
        try {
            const response = await api.get('/api/users/travel/trip');
            setTripData(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            console.error('Error fetching trip data:', error);
            toast.error(locals.FetchError || 'Failed to fetch trips');
        }
    };

    useEffect(() => {
        getTripData();
    }, []);

    const handleView = (row) => {
        setSelectedTrip(row);
        setIsViewModalOpen(true);
    };

    const handleEdit = (row) => {
        setSelectedTrip(row);
        setEndMileage(row.end_mileage || '');
        setIsEditModalOpen(true);
    };

    const handleUpdateMileage = async (e) => {
        e.preventDefault();
        if (!selectedTrip || !endMileage) {
            toast.warn('Please provide an end mileage reading.');
            return;
        }

        const parsedEnd = parseInt(endMileage, 10);
        if (selectedTrip.start_mileage && parsedEnd < parseInt(selectedTrip.start_mileage, 10)) {
            toast.warn('End mileage cannot be less than initial start mileage.');
            return;
        }

        setIsSubmitting(true);
        try {
            await api.patch('/api/users/travel/trip', {
                trip_id: selectedTrip.id,
                end_mileage: parsedEnd,
            });
            toast.success('Trip completed & end mileage saved!');
            setIsEditModalOpen(false);
            getTripData();
        } catch (error) {
            console.error('Error updating end mileage:', error);
            toast.error('Failed to update trip record.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Metrics
    const totalTrips = tripData.length;
    const completedTrips = tripData.filter(t => t.end_mileage && t.end_mileage > 0).length;
    const inTransitTrips = totalTrips - completedTrips;

    // Filtered data
    const filteredTrips = useMemo(() => {
        return tripData.filter(t => {
            const isCompleted = Boolean(t.end_mileage && t.end_mileage > 0);
            if (statusFilter === 'IN_TRANSIT' && isCompleted) return false;
            if (statusFilter === 'COMPLETED' && !isCompleted) return false;
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                return (
                    (t.id && t.id.toString().includes(term)) ||
                    (t.lorry_id && t.lorry_id.toString().includes(term)) ||
                    (t.driver_id && t.driver_id.toString().includes(term)) ||
                    (t.route_id && t.route_id.toString().includes(term))
                );
            }
            return true;
        });
    }, [tripData, statusFilter, searchTerm]);

    return (
        <div className="max-w-7xl mx-auto space-y-6 text-slate-800 font-sans pb-10">
            
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-300">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Fleet Trip Management</h1>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                            {totalTrips} Total Runs
                        </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                        Track active tea leaf collection routes, vehicle assignments, and update completion odometer readings.
                    </p>
                </div>
                
                <Link
                    to="/trip/create"
                    className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl shadow-sm hover:shadow-md transition-all text-xs font-semibold"
                >
                    <span>+ Schedule New Trip</span>
                </Link>
            </div>

            {/* KPI Ribbon */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <span className="text-xs text-slate-500 font-semibold uppercase">Total Dispatches</span>
                        <div className="text-xl font-bold text-slate-900 mt-0.5">{totalTrips} Trips</div>
                    </div>
                    <div className="p-2.5 rounded-xl text-lg bg-slate-100 text-slate-700">
                        🚚
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <span className="text-xs text-slate-500 font-semibold uppercase">In Transit</span>
                        <div className="text-xl font-bold text-amber-600 mt-0.5 flex items-center gap-2">
                            <span>{inTransitTrips} Active</span>
                            {inTransitTrips > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>}
                        </div>
                    </div>
                    <div className="p-2.5 rounded-xl text-lg bg-amber-50 text-amber-600">
                        ⏳
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <span className="text-xs text-slate-500 font-semibold uppercase">Completed Trips</span>
                        <div className="text-xl font-bold text-emerald-600 mt-0.5">{completedTrips} Finished</div>
                    </div>
                    <div className="p-2.5 rounded-xl text-lg bg-emerald-50 text-emerald-600">
                        ✓
                    </div>
                </div>
            </div>

            {/* Filter Tabs & Search Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
                    {['ALL', 'IN_TRANSIT', 'COMPLETED'].map((status) => (
                        <button
                            key={status}
                            onClick={() => setStatusFilter(status)}
                            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                                statusFilter === status
                                    ? 'bg-white text-slate-900 shadow-xs'
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            {status === 'ALL' ? 'All Trips' : status === 'IN_TRANSIT' ? 'In Transit' : 'Completed'}
                        </button>
                    ))}
                </div>

                <div className="relative">
                    <input
                        type="text"
                        placeholder="Search trip ID, lorry, driver..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="text-xs px-3.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400 w-full sm:w-64"
                    />
                </div>
            </div>
            
            {/* AG Grid Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4">
                <AgGrid 
                    rowData={filteredTrips} 
                    columnDefProp={tripColumns} 
                    view={true} 
                    onView={handleView}
                    onEdit={handleEdit}
                    fileName="trip-records"
                />
            </div>

            {/* View Modal */}
            <Modal
                isOpen={isViewModalOpen}
                onClose={() => setIsViewModalOpen(false)}
                title="Trip Log Details"
            >
                {selectedTrip && (
                    <div className="space-y-4 text-xs font-medium">
                        <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <div>
                                <span className="text-[10px] text-slate-400 font-semibold uppercase block">Trip Code</span>
                                <span className="font-bold text-slate-900 text-sm">#{selectedTrip.id}</span>
                            </div>
                            <div>
                                <span className="text-[10px] text-slate-400 font-semibold uppercase block">Status</span>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                                    selectedTrip.end_mileage ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                }`}>
                                    {selectedTrip.end_mileage ? 'Completed' : 'In Transit'}
                                </span>
                            </div>
                            <div>
                                <span className="text-[10px] text-slate-400 font-semibold uppercase block">Lorry ID</span>
                                <span className="text-slate-800 font-bold">Lorry #{selectedTrip.lorry_id}</span>
                            </div>
                            <div>
                                <span className="text-[10px] text-slate-400 font-semibold uppercase block">Route Code</span>
                                <span className="text-slate-800 font-bold">Route #{selectedTrip.route_id}</span>
                            </div>
                            <div>
                                <span className="text-[10px] text-slate-400 font-semibold uppercase block">Driver ID</span>
                                <span className="text-slate-800">Staff #{selectedTrip.driver_id}</span>
                            </div>
                            <div>
                                <span className="text-[10px] text-slate-400 font-semibold uppercase block">Helper ID</span>
                                <span className="text-slate-800">Staff #{selectedTrip.helper_id}</span>
                            </div>
                            <div>
                                <span className="text-[10px] text-slate-400 font-semibold uppercase block">Start Mileage</span>
                                <span className="text-slate-800 font-mono font-bold">{selectedTrip.start_mileage} km</span>
                            </div>
                            <div>
                                <span className="text-[10px] text-slate-400 font-semibold uppercase block">End Mileage</span>
                                <span className="text-slate-800 font-mono font-bold">{selectedTrip.end_mileage ? `${selectedTrip.end_mileage} km` : 'Not recorded yet'}</span>
                            </div>
                        </div>

                        <div className="flex justify-end pt-3 border-t border-slate-200">
                            <button
                                onClick={() => setIsViewModalOpen(false)}
                                className="px-4 py-2 rounded-xl bg-slate-200 text-slate-800 text-xs font-semibold hover:bg-slate-300 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Edit End Mileage Modal */}
            <Modal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                title="Record Trip End Mileage"
            >
                {selectedTrip && (
                    <form onSubmit={handleUpdateMileage} className="space-y-4 text-xs">
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-slate-700 flex items-center justify-between">
                            <div>
                                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Trip Reference</span>
                                <span className="font-bold text-slate-900">Trip #{selectedTrip.id}</span>
                            </div>
                            <div className="text-right">
                                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Start Odometer</span>
                                <span className="font-mono font-bold text-slate-900">{selectedTrip.start_mileage} km</span>
                            </div>
                        </div>

                        <TextInput
                            name="end_mileage"
                            label="Final End Mileage (km) *"
                            type="number"
                            placeholder="Enter final odometer reading"
                            value={endMileage}
                            onChange={(e) => setEndMileage(e.target.value)}
                        />

                        <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200">
                            <button
                                type="button"
                                onClick={() => setIsEditModalOpen(false)}
                                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                            <Button
                                name={isSubmitting ? "Saving..." : "Save & Complete Trip"}
                                onClick={handleUpdateMileage}
                                disabled={isSubmitting || !endMileage}
                                btncss="bg-slate-900 hover:bg-slate-800 text-white rounded-xl px-4 py-2 text-xs font-semibold"
                            />
                        </div>
                    </form>
                )}
            </Modal>
        </div>
    );
};

export default Trip;