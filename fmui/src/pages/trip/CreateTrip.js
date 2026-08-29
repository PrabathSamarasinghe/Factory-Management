import React, { useEffect, useState, useMemo } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { DraggableItem, DropZone, TYPE_CONFIG } from "../../utils/CreateTripFunctions";
import api from "../../api/axios";
import { toast } from "react-toastify";
import TextInput from "../../components/TextInput";
import Button from "../../components/Button";
import { Link, useNavigate } from "react-router-dom";

const CreateTrip = () => {
    const navigate = useNavigate();
    const [drivers, setDrivers] = useState([]);
    const [helpers, setHelpers] = useState([]);
    const [lorries, setLorries] = useState([]);
    const [routes, setRoutes] = useState([]);
    
    const [searchFilters, setSearchFilters] = useState({
        driver: "",
        helper: "",
        lorry: "",
        route: ""
    });

    const [startMileage, setStartMileage] = useState("");
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [activeDragData, setActiveDragData] = useState(null);

    const [trip, setTrip] = useState({
        driver: null,
        helper: null,
        lorry: null,
        route: null,
    });

    const fetchTripStaffData = async () => {
        setIsLoadingData(true);
        try {
            const response = await api.get("/api/users/all/types");
            const data = response.data || {};
            setDrivers(data.driver || []);
            setHelpers(data.helper || []);
            setLorries(data.lorry || []);
            setRoutes(data.route || []);
        } catch (error) {
            console.error("Error fetching trip staff data:", error);
            toast.error("Failed to load available fleet and personnel.");
        } finally {
            setIsLoadingData(false);
        }
    };

    useEffect(() => {
        fetchTripStaffData();
    }, []);

    // Handle Quick Click Select
    const handleQuickSelect = (item, type) => {
        setTrip(prev => {
            const next = { ...prev, [type]: item };
            // If selecting a lorry and it has mileage, pre-fill startMileage if empty
            if (type === "lorry" && item.mileage && !startMileage) {
                setStartMileage(item.mileage.toString());
            }
            return next;
        });
    };

    const handleRemoveAssignment = (type) => {
        setTrip(prev => ({ ...prev, [type]: null }));
    };

    const handleResetAll = () => {
        setTrip({
            driver: null,
            helper: null,
            lorry: null,
            route: null,
        });
        setStartMileage("");
    };

    // Handle DnD
    function handleDragStart(event) {
        const { active } = event;
        setActiveDragData({
            item: active.data.current.item,
            type: active.data.current.type,
        });
    }

    function handleDragEnd(event) {
        setActiveDragData(null);
        const { active, over } = event;
        if (!over) return;

        const draggedItem = active.data.current.item;
        const draggedType = active.data.current.type;
        const dropType = over.data.current.type;

        if (draggedType !== dropType) return;

        setTrip((prev) => {
            if (draggedType === "lorry" && draggedItem.mileage && !startMileage) {
                setStartMileage(draggedItem.mileage.toString());
            }
            return {
                ...prev,
                [draggedType]: draggedItem,
            };
        });
    }

    async function createTrip() {
        if (!trip.driver || !trip.helper || !trip.lorry || !trip.route) {
            toast.warn("Please assign all 4 trip components.");
            return;
        }

        if (!startMileage || isNaN(startMileage) || parseInt(startMileage, 10) < 0) {
            toast.warn("Please enter a valid starting mileage.");
            return;
        }

        setIsSubmitting(true);
        const tripData = {
            driver_id: trip.driver.id,
            helper_id: trip.helper.id,
            lorry_id: trip.lorry.id,
            route_id: trip.route.id,
            start_mileage: parseInt(startMileage, 10),
        };

        try {
            await api.post("/api/users/travel/trip", tripData);
            toast.success("Trip successfully scheduled!");
            handleResetAll();
            navigate("/trip");
        } catch (error) {
            console.error("Error creating trip:", error);
            toast.error("Failed to schedule trip. Please check your data.");
        } finally {
            setIsSubmitting(false);
        }
    }

    // Filtered lists
    const filteredDrivers = useMemo(() => 
        drivers.filter(d => d.label?.toLowerCase().includes(searchFilters.driver.toLowerCase())),
        [drivers, searchFilters.driver]
    );

    const filteredHelpers = useMemo(() => 
        helpers.filter(h => h.label?.toLowerCase().includes(searchFilters.helper.toLowerCase())),
        [helpers, searchFilters.helper]
    );

    const filteredLorries = useMemo(() => 
        lorries.filter(l => l.label?.toLowerCase().includes(searchFilters.lorry.toLowerCase())),
        [lorries, searchFilters.lorry]
    );

    const filteredRoutes = useMemo(() => 
        routes.filter(r => r.label?.toLowerCase().includes(searchFilters.route.toLowerCase())),
        [routes, searchFilters.route]
    );

    // Progress counter
    const assignedCount = [trip.driver, trip.helper, trip.lorry, trip.route].filter(Boolean).length;
    const isReady = assignedCount === 4 && Boolean(startMileage);

    return (
        <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="max-w-7xl mx-auto space-y-6 text-slate-800 font-sans pb-10">
                
                {/* Header with quick stats */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-300 gap-4">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Schedule New Trip</h1>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-700">
                                Step 1 of 1
                            </span>
                        </div>
                        <p className="text-sm text-slate-500 mt-1">
                            Drag or click resources below to allocate fleet and personnel to a collection run.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        {assignedCount > 0 && (
                            <button
                                onClick={handleResetAll}
                                className="text-xs font-medium text-slate-500 hover:text-red-600 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-red-200 transition-colors"
                            >
                                Clear Selection
                            </button>
                        )}
                        <Link
                            to="/trip"
                            className="text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 px-3.5 py-2 rounded-lg shadow-xs transition-colors"
                        >
                            ← View All Trips
                        </Link>
                    </div>
                </div>

                {/* Assignment Target Canvas (Top Sticky Section) */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 overflow-hidden ring-1 ring-slate-900/5">
                    <div className="bg-slate-900 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-white">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-red-600/90 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                                🚀
                            </div>
                            <div>
                                <h2 className="text-base font-semibold leading-tight">Trip Assignment Configuration</h2>
                                <p className="text-xs text-slate-400">All 4 slots must be assigned to dispatch</p>
                            </div>
                        </div>

                        {/* Progress Pill */}
                        <div className="flex items-center gap-3">
                            <div className="w-32 bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
                                <div 
                                    className="bg-emerald-500 h-full transition-all duration-300 rounded-full"
                                    style={{ width: `${(assignedCount / 4) * 100}%` }}
                                />
                            </div>
                            <span className="text-xs font-mono font-medium text-slate-300">
                                {assignedCount}/4 Slots
                            </span>
                        </div>
                    </div>
                    
                    <div className="p-6 space-y-6">
                        {/* 4 Drop Zones Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <DropZone 
                                type="driver" 
                                label="Assign Driver *" 
                                value={trip.driver} 
                                onRemove={handleRemoveAssignment} 
                            />
                            <DropZone 
                                type="helper" 
                                label="Assign Helper *" 
                                value={trip.helper} 
                                onRemove={handleRemoveAssignment} 
                            />
                            <DropZone 
                                type="lorry" 
                                label="Assign Lorry *" 
                                value={trip.lorry} 
                                onRemove={handleRemoveAssignment} 
                            />
                            <DropZone 
                                type="route" 
                                label="Assign Route *" 
                                value={trip.route} 
                                onRemove={handleRemoveAssignment} 
                            />
                        </div>

                        {/* Configuration Details & Final Submit Bar */}
                        <div className="pt-5 border-t border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="w-full md:w-80">
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                                    Initial Odometer / Start Mileage (km) *
                                </label>
                                <div className="relative">
                                    <TextInput 
                                        name="start_mileage"
                                        type="number" 
                                        value={startMileage}
                                        onChange={(e) => setStartMileage(e.target.value)}
                                        placeholder="e.g. 14520"
                                        divcss="mb-0"
                                        inputcss="pl-9 py-2 text-sm font-medium"
                                    />
                                    <span className="absolute left-3 top-2.5 text-slate-400 text-sm">
                                        ⚡
                                    </span>
                                </div>
                            </div>

                            {/* Live Route Summary Pill */}
                            <div className="flex-1 hidden xl:flex items-center justify-center px-4">
                                {assignedCount > 0 && (
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs text-slate-600 flex items-center gap-2">
                                        <span className="font-semibold text-slate-800">{trip.driver?.label || "Driver"}</span>
                                        <span className="text-slate-400">+</span>
                                        <span className="font-semibold text-slate-800">{trip.helper?.label || "Helper"}</span>
                                        <span className="text-slate-400">➔</span>
                                        <span className="font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">{trip.lorry?.label || "Lorry"}</span>
                                        <span className="text-slate-400">➔</span>
                                        <span className="font-semibold text-purple-800 bg-purple-100 px-2 py-0.5 rounded">{trip.route?.label || "Route"}</span>
                                    </div>
                                )}
                            </div>

                            <div className="shrink-0">
                                <Button
                                    name={isSubmitting ? "Scheduling Trip..." : "Confirm & Schedule Trip"}
                                    onClick={createTrip}
                                    disabled={!isReady || isSubmitting}
                                    btncss="px-8 py-3 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Available Resources Grid */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-base font-bold text-slate-800">
                            Available Resources Pool
                        </h2>
                        <span className="text-xs text-slate-500">
                            Click any item or drag into the slots above
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                        
                        {/* 1. Drivers Column */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col h-[420px] overflow-hidden">
                            <div className="bg-blue-50/70 px-4 py-3 border-b border-blue-100 flex items-center justify-between">
                                <h3 className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                    Drivers
                                </h3>
                                <span className="text-[11px] font-semibold bg-blue-200/80 text-blue-800 px-2 py-0.5 rounded-full">
                                    {filteredDrivers.length}
                                </span>
                            </div>
                            <div className="p-2.5 border-b border-slate-100 bg-slate-50/40">
                                <input
                                    type="text"
                                    placeholder="Filter drivers..."
                                    value={searchFilters.driver}
                                    onChange={(e) => setSearchFilters(prev => ({ ...prev, driver: e.target.value }))}
                                    className="w-full text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                                />
                            </div>
                            <div className="flex-1 p-3 overflow-y-auto space-y-2.5 bg-slate-50/20">
                                {isLoadingData ? (
                                    <div className="text-center py-8 text-xs text-slate-400 animate-pulse">Loading drivers...</div>
                                ) : filteredDrivers.length === 0 ? (
                                    <div className="text-center py-8 text-xs text-slate-400">No matching drivers</div>
                                ) : (
                                    filteredDrivers.map((driver) => (
                                        <DraggableItem 
                                            key={driver.id} 
                                            item={driver} 
                                            type="driver" 
                                            isSelected={trip.driver?.id === driver.id}
                                            onQuickSelect={handleQuickSelect}
                                        />
                                    ))
                                )}
                            </div>
                        </div>

                        {/* 2. Helpers Column */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col h-[420px] overflow-hidden">
                            <div className="bg-emerald-50/70 px-4 py-3 border-b border-emerald-100 flex items-center justify-between">
                                <h3 className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                    Helpers
                                </h3>
                                <span className="text-[11px] font-semibold bg-emerald-200/80 text-emerald-800 px-2 py-0.5 rounded-full">
                                    {filteredHelpers.length}
                                </span>
                            </div>
                            <div className="p-2.5 border-b border-slate-100 bg-slate-50/40">
                                <input
                                    type="text"
                                    placeholder="Filter helpers..."
                                    value={searchFilters.helper}
                                    onChange={(e) => setSearchFilters(prev => ({ ...prev, helper: e.target.value }))}
                                    className="w-full text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                />
                            </div>
                            <div className="flex-1 p-3 overflow-y-auto space-y-2.5 bg-slate-50/20">
                                {isLoadingData ? (
                                    <div className="text-center py-8 text-xs text-slate-400 animate-pulse">Loading helpers...</div>
                                ) : filteredHelpers.length === 0 ? (
                                    <div className="text-center py-8 text-xs text-slate-400">No matching helpers</div>
                                ) : (
                                    filteredHelpers.map((helper) => (
                                        <DraggableItem 
                                            key={helper.id} 
                                            item={helper} 
                                            type="helper" 
                                            isSelected={trip.helper?.id === helper.id}
                                            onQuickSelect={handleQuickSelect}
                                        />
                                    ))
                                )}
                            </div>
                        </div>

                        {/* 3. Lorries Column */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col h-[420px] overflow-hidden">
                            <div className="bg-amber-50/70 px-4 py-3 border-b border-amber-100 flex items-center justify-between">
                                <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                    Lorries
                                </h3>
                                <span className="text-[11px] font-semibold bg-amber-200/80 text-amber-800 px-2 py-0.5 rounded-full">
                                    {filteredLorries.length}
                                </span>
                            </div>
                            <div className="p-2.5 border-b border-slate-100 bg-slate-50/40">
                                <input
                                    type="text"
                                    placeholder="Filter lorries..."
                                    value={searchFilters.lorry}
                                    onChange={(e) => setSearchFilters(prev => ({ ...prev, lorry: e.target.value }))}
                                    className="w-full text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                                />
                            </div>
                            <div className="flex-1 p-3 overflow-y-auto space-y-2.5 bg-slate-50/20">
                                {isLoadingData ? (
                                    <div className="text-center py-8 text-xs text-slate-400 animate-pulse">Loading lorries...</div>
                                ) : filteredLorries.length === 0 ? (
                                    <div className="text-center py-8 text-xs text-slate-400">No matching lorries</div>
                                ) : (
                                    filteredLorries.map((lorry) => (
                                        <DraggableItem 
                                            key={lorry.id} 
                                            item={lorry} 
                                            type="lorry" 
                                            isSelected={trip.lorry?.id === lorry.id}
                                            onQuickSelect={handleQuickSelect}
                                        />
                                    ))
                                )}
                            </div>
                        </div>

                        {/* 4. Routes Column */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col h-[420px] overflow-hidden">
                            <div className="bg-purple-50/70 px-4 py-3 border-b border-purple-100 flex items-center justify-between">
                                <h3 className="text-xs font-bold text-purple-900 uppercase tracking-wider flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                                    Routes
                                </h3>
                                <span className="text-[11px] font-semibold bg-purple-200/80 text-purple-800 px-2 py-0.5 rounded-full">
                                    {filteredRoutes.length}
                                </span>
                            </div>
                            <div className="p-2.5 border-b border-slate-100 bg-slate-50/40">
                                <input
                                    type="text"
                                    placeholder="Filter routes..."
                                    value={searchFilters.route}
                                    onChange={(e) => setSearchFilters(prev => ({ ...prev, route: e.target.value }))}
                                    className="w-full text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-purple-400"
                                />
                            </div>
                            <div className="flex-1 p-3 overflow-y-auto space-y-2.5 bg-slate-50/20">
                                {isLoadingData ? (
                                    <div className="text-center py-8 text-xs text-slate-400 animate-pulse">Loading routes...</div>
                                ) : filteredRoutes.length === 0 ? (
                                    <div className="text-center py-8 text-xs text-slate-400">No matching routes</div>
                                ) : (
                                    filteredRoutes.map((route) => (
                                        <DraggableItem 
                                            key={route.id} 
                                            item={route} 
                                            type="route" 
                                            isSelected={trip.route?.id === route.id}
                                            onQuickSelect={handleQuickSelect}
                                        />
                                    ))
                                )}
                            </div>
                        </div>

                    </div>
                </div>

            </div>
            
            {/* Smooth Floating Drag Overlay */}
            <DragOverlay dropAnimation={null}>
                {activeDragData ? (
                    <div className="p-3 rounded-xl border border-slate-300 bg-white shadow-2xl flex items-center gap-3 w-56 text-sm text-slate-800 cursor-grabbing ring-2 ring-slate-900/20 backdrop-blur-md bg-white/95">
                        <div className="p-1 rounded bg-slate-100 text-slate-700">
                            {TYPE_CONFIG[activeDragData.type]?.icon}
                        </div>
                        <span className="font-semibold truncate">{activeDragData.item.label}</span>
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
};

export default CreateTrip;