export const userTypeColumnDefs = (userType) => {
    switch (userType) {
        case 'supplier':
            return ["id", "name", "nic_number", "birthday", "supplier_id", "custom_id", "route_id"];
        default:
            return ["id", "name", "nic_number", "birthday", "employee_id", "job", "job_title"];
    }
};

export const tripColumns = ["id", "date", "lorry_id", "route_id", "driver_id", "helper_id", "start_mileage", "end_mileage"];

export const lorryColumns = ["id", "lorry_number", "mileage"];

export const routeColumns = ["id", "line_name"];

export const attendanceColumns = ["employee_id", "name", "date", "in_time", "out_time", "overtime_hours", "status"];

export const boughtLeafColumns = ["supplier_code", "supplier_name", "gross_weight", "water_deduction", "tare_deduction", "net_weight", "date"];
