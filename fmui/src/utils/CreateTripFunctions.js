import React from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";

// Specific category styling & icons
const TYPE_CONFIG = {
    driver: {
        badgeBg: "bg-blue-50 border-blue-200 text-blue-700",
        activeRing: "ring-blue-400 border-blue-400 bg-blue-50/50",
        dotColor: "bg-blue-500",
        icon: (
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
        ),
    },
    helper: {
        badgeBg: "bg-emerald-50 border-emerald-200 text-emerald-700",
        activeRing: "ring-emerald-400 border-emerald-400 bg-emerald-50/50",
        dotColor: "bg-emerald-500",
        icon: (
            <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
        ),
    },
    lorry: {
        badgeBg: "bg-amber-50 border-amber-200 text-amber-700",
        activeRing: "ring-amber-400 border-amber-400 bg-amber-50/50",
        dotColor: "bg-amber-500",
        icon: (
            <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 17a2 2 0 100 4 2 2 0 000-4zm10 0a2 2 0 100 4 2 2 0 000-4zm-8-7h6m-8 3h8m-8-6h4M3 5h12l4 5v7H3V5z" />
            </svg>
        ),
    },
    route: {
        badgeBg: "bg-purple-50 border-purple-200 text-purple-700",
        activeRing: "ring-purple-400 border-purple-400 bg-purple-50/50",
        dotColor: "bg-purple-500",
        icon: (
            <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
        ),
    },
};

const DraggableItem = ({ item, type, isSelected, onQuickSelect }) => {
    const uniqueId = `${type}-${item.id}`;

    const { attributes, listeners, setNodeRef, transform, isDragging } =
        useDraggable({
            id: uniqueId,
            data: {
                type,
                item,
            },
        });

    const style = transform
        ? {
            transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
            zIndex: 50,
        }
        : undefined;

    const config = TYPE_CONFIG[type] || TYPE_CONFIG.driver;

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            onClick={() => onQuickSelect && onQuickSelect(item, type)}
            className={`
                group relative p-3 rounded-xl border transition-all duration-200 select-none cursor-grab active:cursor-grabbing
                ${isSelected 
                    ? 'bg-slate-100 border-slate-300 opacity-60' 
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5'
                }
                ${isDragging ? 'opacity-40 ring-2 ring-slate-400 shadow-xl' : ''}
            `}
        >
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`p-1.5 rounded-lg shrink-0 border ${config.badgeBg}`}>
                        {config.icon}
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate group-hover:text-slate-950">
                            {item.label}
                        </p>
                        {item.mileage !== undefined && (
                            <p className="text-[11px] text-slate-500 font-mono">
                                Odometer: {item.mileage.toLocaleString()} km
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                    {isSelected ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-200 text-slate-700">
                            Assigned
                        </span>
                    ) : (
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs font-semibold text-slate-400 hover:text-slate-700">
                            Select ↵
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

const DropZone = ({ type, label, value, onRemove }) => {
    const { isOver, setNodeRef } = useDroppable({
        id: `drop-${type}`,
        data: {
            type,
        },
    });

    const config = TYPE_CONFIG[type] || TYPE_CONFIG.driver;

    return (
        <div
            ref={setNodeRef}
            className={`
                relative min-h-[110px] p-3.5 rounded-xl border-2 transition-all duration-200 flex flex-col justify-center
                ${value 
                    ? 'border-solid border-slate-200 bg-white shadow-sm' 
                    : 'border-dashed ' + (isOver ? config.activeRing : 'border-slate-300 bg-slate-50/70 hover:bg-slate-100/50')
                }
            `}
        >
            {value ? (
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2.5 rounded-xl border ${config.badgeBg} shrink-0`}>
                            {config.icon}
                        </div>
                        <div className="min-w-0">
                            <span className="text-[11px] uppercase font-bold tracking-wider text-slate-400 block mb-0.5">
                                {label}
                            </span>
                            <span className="text-sm font-bold text-slate-800 truncate block">
                                {value.label || value.name || "Assigned"}
                            </span>
                            {value.mileage !== undefined && (
                                <span className="text-xs text-slate-500 font-mono block">
                                    Current: {value.mileage.toLocaleString()} km
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        {onRemove && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRemove(type);
                                }}
                                className="w-6 h-6 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors"
                                title="Remove assignment"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center text-center py-2 cursor-pointer">
                    <div className={`p-2 rounded-full mb-1.5 ${isOver ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-400'}`}>
                        {config.icon}
                    </div>
                    <p className="text-xs font-semibold text-slate-600">
                        {label}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                        {isOver ? "Release to drop" : "Drag or click to assign"}
                    </p>
                </div>
            )}
        </div>
    );
};

export { DraggableItem, DropZone, TYPE_CONFIG };