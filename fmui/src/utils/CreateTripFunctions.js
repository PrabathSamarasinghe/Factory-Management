import {
    useDraggable,
    useDroppable,
} from "@dnd-kit/core";

const DraggableItem = ({ item, type }) => {
    // FIX: Combine type and item.id to create a globally unique ID (e.g., "driver-1")
    const uniqueId = `${type}-${item.id}`; 

    const { attributes, listeners, setNodeRef, transform, isDragging } =
        useDraggable({
            id: uniqueId, 
            data: {
                type,
                item, // We still pass the original raw object here, so your save function still gets the correct DB id!
            },
        });

    const style = transform
        ? {
            transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
            zIndex: 50,
        }
        : undefined;

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            className={`
                p-2.5 mb-2 rounded border border-slate-200 bg-white cursor-grab
                text-sm text-slate-700 shadow-sm transition-shadow hover:shadow-md hover:border-slate-300
                flex items-center gap-2
                ${isDragging ? "opacity-60 ring-2 ring-slate-400 cursor-grabbing" : ""}
            `}
        >
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
            
            <span className="font-medium">
                {item.label}
            </span>
        </div>
    );
}

const DropZone = ({ type, label, value }) => {
    const { isOver, setNodeRef } = useDroppable({
        id: `drop-${type}`,
        data: {
            type,
        },
    });

    return (
        <div
            ref={setNodeRef}
            className={`
                min-h-[100px] p-4 rounded border-2 border-dashed transition-colors flex flex-col items-center justify-center text-center
                ${isOver
                    ? "border-slate-500 bg-slate-100"
                    : "border-slate-300 bg-slate-50 hover:bg-slate-100/50"
                }
            `}
        >
            {value ? (
                <div className="bg-white p-3 rounded border border-slate-200 shadow-sm w-full flex items-center justify-between text-sm text-slate-800 font-medium">
                    {value.label || value.name || value.username || "Selected"}
                    
                    {/* Checkmark to indicate successful drop */}
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
            ) : (
                <>
                    <svg className={`w-6 h-6 mb-2 ${isOver ? 'text-slate-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <div className="text-slate-500 text-sm font-medium">
                        {label}
                    </div>
                </>
            )}
        </div>
    );
}

export { DraggableItem, DropZone };