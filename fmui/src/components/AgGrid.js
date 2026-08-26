import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import RemoveRedEyeOutlinedIcon from '@mui/icons-material/RemoveRedEyeOutlined';

ModuleRegistry.registerModules([AllCommunityModule]);

const AgGrid = ({ rowData, columnDefProp, view }) => {

    const viewCellRenderer = (params) => {
        return (
            <button
                onClick={() => console.log('View clicked for row:', params.data)}
                className="text-black hover:text-gray-600 focus:outline-none flex items-center justify-center w-full h-full transition-colors"
                aria-label="View row"
            >
                <RemoveRedEyeOutlinedIcon fontSize="small" />
            </button>
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

    if (view) {
        columnDefs.push({
            headerName: 'Actions',
            field: 'actions',
            cellRenderer: viewCellRenderer,
            sortable: false,
            filter: false,
            resizable: false,
            width: 90,
            cellStyle: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
        });
    }

    const defaultColDef = {
        flex: 1,
        minWidth: 120,
        cellStyle: { display: 'flex', alignItems: 'center' },
    };

    return (
        <div className="ag-theme-alpine bw-grid h-[400px] w-full">
            <AgGridReact
                rowData={rowData}
                columnDefs={columnDefs}
                defaultColDef={defaultColDef}
                rowHeight={44}
                headerHeight={44}
                animateRows={true}
            />
        </div>
    );
};

export default AgGrid;