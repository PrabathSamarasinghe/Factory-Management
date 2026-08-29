import React, { useRef, useCallback } from 'react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import RemoveRedEyeOutlinedIcon from '@mui/icons-material/RemoveRedEyeOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';

ModuleRegistry.registerModules([AllCommunityModule]);

const AgGrid = ({ 
    rowData, 
    columnDefProp = [], 
    view, 
    onView, 
    onEdit, 
    onDelete, 
    height, 
    pagination = true, 
    paginationPageSize = 10,
    enableExport = true,
    fileName = 'export-data'
}) => {
    const gridRef = useRef(null);

    const onExportClick = useCallback(() => {
        if (gridRef.current && gridRef.current.api) {
            gridRef.current.api.exportDataAsCsv({
                fileName: `${fileName}-${new Date().toISOString().split('T')[0]}.csv`,
            });
        }
    }, [fileName]);

    const actionCellRenderer = (params) => {
        return (
            <div className="flex items-center justify-center gap-2 w-full h-full">
                {(view || onView) && (
                    <button
                        onClick={() => onView ? onView(params.data) : console.log('View clicked for row:', params.data)}
                        className="text-slate-600 hover:text-slate-900 focus:outline-none transition-colors p-1"
                        aria-label="View row"
                        title="View details"
                    >
                        <RemoveRedEyeOutlinedIcon fontSize="small" />
                    </button>
                )}
                {onEdit && (
                    <button
                        onClick={() => onEdit(params.data)}
                        className="text-blue-600 hover:text-blue-800 focus:outline-none transition-colors p-1"
                        aria-label="Edit row"
                        title="Edit"
                    >
                        <EditOutlinedIcon fontSize="small" />
                    </button>
                )}
                {onDelete && (
                    <button
                        onClick={() => onDelete(params.data)}
                        className="text-red-500 hover:text-red-700 focus:outline-none transition-colors p-1"
                        aria-label="Delete row"
                        title="Delete"
                    >
                        <DeleteOutlineOutlinedIcon fontSize="small" />
                    </button>
                )}
            </div>
        );
    };

    const columnDefs = columnDefProp.map((colDef) => {
        return {
            headerName: colDef.charAt(0).toUpperCase() + colDef.slice(1).replace(/_/g, ' '),
            field: colDef,
            sortable: true,
            filter: true,
            resizable: true,
        };
    });

    if (view || onView || onEdit || onDelete) {
        const actionWidth = 40 + (onView || view ? 30 : 0) + (onEdit ? 30 : 0) + (onDelete ? 30 : 0);
        columnDefs.push({
            headerName: 'Actions',
            field: 'actions',
            cellRenderer: actionCellRenderer,
            sortable: false,
            filter: false,
            resizable: false,
            width: Math.max(90, actionWidth),
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
        });
    }

    const defaultColDef = {
        flex: 1,
        minWidth: 120,
        cellStyle: { display: 'flex', alignItems: 'center' },
    };

    return (
        <div className="w-full flex flex-col">
            {enableExport && (
                <div className="flex justify-end mb-2">
                    <button
                        onClick={onExportClick}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded shadow-xs transition-colors"
                        title="Export current table data to CSV"
                    >
                        <FileDownloadOutlinedIcon fontSize="inherit" className="text-slate-500" />
                        <span>Export CSV</span>
                    </button>
                </div>
            )}
            <div className={`ag-theme-alpine bw-grid ${height || 'h-[440px]'} w-full rounded border border-slate-200 shadow-xs overflow-hidden`}>
                <AgGridReact
                    ref={gridRef}
                    rowData={rowData}
                    columnDefs={columnDefs}
                    defaultColDef={defaultColDef}
                    rowHeight={44}
                    headerHeight={44}
                    animateRows={true}
                    pagination={pagination}
                    paginationPageSize={paginationPageSize}
                    paginationPageSizeSelector={[10, 25, 50, 100]}
                />
            </div>
        </div>
    );
};

export default AgGrid;