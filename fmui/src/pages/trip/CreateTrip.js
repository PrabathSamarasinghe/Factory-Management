import { useEffect, useState } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { DraggableItem, DropZone } from "../../utils/CreateTripFunctions";
import api from "../../api/axios";
import { ToastContainer, toast } from "react-toastify";

const CreateTrip = () => {
    const [drivers, setDrivers] = useState([]);
    const [helpers, setHelpers] = useState([]);
    const [lorries, setLorries] = useState([]);
    const [routes, setRoutes] = useState([]);
    
    // State to track what is currently being dragged for the overlay
    const [activeDragData, setActiveDragData] = useState(null);

    const fetchTripStaffData = async () => {
        try {
            const response = await api.get("/api/users/all/types", {
                headers: {
                    Authorization: `Bearer ${sessionStorage.getItem("token")}`,
                },
            });
            if (response.status !== 200) {
                throw new Error("Failed to fetch trip staff data");
            }
            const data = await response.data;
            setDrivers(data.driver);
            setHelpers(data.helper);
            setLorries(data.lorry);
            setRoutes(data.route);
        } catch (error) {
            console.error("Error fetching trip staff data:", error);
            toast.error("Error fetching trip staff data");
        }
    };

    useEffect(() => {
        fetchTripStaffData();
    }, []);

    const [trip, setTrip] = useState({
        driver: null,
        helper: null,
        lorry: null,
        route: null,
    });

    // Handle the start of a drag
    function handleDragStart(event) {
        const { active } = event;
        setActiveDragData({
            item: active.data.current.item,
            type: active.data.current.type,
        });
    }

    // Handle the end of a drag
    function handleDragEnd(event) {
        setActiveDragData(null); // Clear the overlay
        
        const { active, over } = event;
        if (!over) return;

        const draggedItem = active.data.current.item;
        const draggedType = active.data.current.type;
        const dropType = over.data.current.type;

        if (draggedType !== dropType) return;

        setTrip((prev) => ({
            ...prev,
            [draggedType]: draggedItem,
        }));
    }

    function createTrip() {
        if (!trip.driver || !trip.helper || !trip.lorry || !trip.route) {
            toast.warn("Please select all trip components.");
            return;
        }

        const tripData = {
            driverId: trip.driver.id,
            helperId: trip.helper.id,
            lorryId: trip.lorry.id,
            routeId: trip.route.id,
        };

        console.log("Creating trip:", tripData);
        // api.post("/api/trips", tripData)
    }

    return (
        <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="max-w-7xl mx-auto space-y-6 text-slate-800 font-sans">
                
                {/* Page Header */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-300">
                    <div>
                        <h1 className="text-2xl font-normal text-slate-700 tracking-wide">Schedule Trip</h1>
                        <p className="text-sm text-slate-500 mt-1">Drag and drop resources to assign them to a new trip schedule.</p>
                    </div>
                </div>

                {/* Resources Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Drivers Panel */}
                    <div className="bg-white rounded border border-slate-200 shadow-sm flex flex-col h-[400px]">
                        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 overflow-hidden">
                            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                Drivers
                            </h2>
                        </div>
                        <div className="flex-1 p-3 overflow-y-auto space-y-2 bg-slate-50/50">
                            {drivers?.map((driver) => (
                                <DraggableItem key={driver.id} item={driver} type="driver" />
                            ))}
                        </div>
                    </div>

                    {/* Helpers Panel */}
                    <div className="bg-white rounded border border-slate-200 shadow-sm flex flex-col h-[400px]">
                        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                Helpers
                            </h2>
                        </div>
                        <div className="flex-1 p-3 overflow-y-auto space-y-2 bg-slate-50/50">
                            {helpers?.map((helper) => (
                                <DraggableItem key={helper.id} item={helper} type="helper" />
                            ))}
                        </div>
                    </div>

                    {/* Lorries Panel */}
                    <div className="bg-white rounded border border-slate-200 shadow-sm flex flex-col h-[400px]">
                        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                                Lorries
                            </h2>
                        </div>
                        <div className="flex-1 p-3 overflow-y-auto space-y-2 bg-slate-50/50">
                            {lorries?.map((lorry) => (
                                <DraggableItem key={lorry.id} item={lorry} type="lorry" />
                            ))}
                        </div>
                    </div>

                    {/* Routes Panel */}
                    <div className="bg-white rounded border border-slate-200 shadow-sm flex flex-col h-[400px]">
                        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                                Routes
                            </h2>
                        </div>
                        <div className="flex-1 p-3 overflow-y-auto space-y-2 bg-slate-50/50">
                            {routes?.map((route) => (
                                <DraggableItem key={route.id} item={route} type="route" />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Trip Configuration Area */}
                <div className="bg-white rounded shadow-sm border-t-2 border-t-red-600 border-x border-b border-slate-200">
                    <div className="px-5 py-4 border-b border-slate-200">
                        <h2 className="text-lg font-medium text-slate-800">Trip Configuration</h2>
                    </div>
                    
                    <div className="p-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <div className="flex flex-col">
                                <label className="text-sm font-semibold text-slate-600 mb-2">Assigned Driver *</label>
                                <DropZone type="driver" label="Drop Driver Here" value={trip.driver} />
                            </div>
                            
                            <div className="flex flex-col">
                                <label className="text-sm font-semibold text-slate-600 mb-2">Assigned Helper *</label>
                                <DropZone type="helper" label="Drop Helper Here" value={trip.helper} />
                            </div>
                            
                            <div className="flex flex-col">
                                <label className="text-sm font-semibold text-slate-600 mb-2">Assigned Lorry *</label>
                                <DropZone type="lorry" label="Drop Lorry Here" value={trip.lorry} />
                            </div>
                            
                            <div className="flex flex-col">
                                <label className="text-sm font-semibold text-slate-600 mb-2">Assigned Route *</label>
                                <DropZone type="route" label="Drop Route Here" value={trip.route} />
                            </div>
                        </div>

                        <div className="mt-8 pt-5 border-t border-slate-200 flex justify-end">
                            <button
                                onClick={createTrip}
                                disabled={!trip.driver || !trip.helper || !trip.lorry || !trip.route}
                                className="px-6 py-2.5 rounded bg-slate-800 text-white text-sm font-medium tracking-wide transition-colors hover:bg-slate-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed shadow-sm"
                            >
                                + Create Trip
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* The Drag Overlay floats above everything else and isn't trapped by overflow hidden/auto */}
            <DragOverlay dropAnimation={null}>
                {activeDragData ? (
                    <div className="p-2.5 rounded border border-slate-300 bg-white shadow-lg flex items-center gap-2 opacity-90 w-48 text-sm text-slate-700 cursor-grabbing ring-2 ring-slate-400">
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                        </svg>
                        <span className="font-medium">{activeDragData.item.label}</span>
                    </div>
                ) : null}
            </DragOverlay>

            <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} />
        </DndContext>
    );
};

export default CreateTrip;