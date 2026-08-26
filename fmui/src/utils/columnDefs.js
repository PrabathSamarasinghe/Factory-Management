export const userTypeColumnDefs = (userType) => {
    switch (userType) {
        case 'supplier':
            return ["id", "name", "nic_number", "birthday", "supplier_id", "custom_id", "route_id"];
        default:
            return ["id", "name", "nic_number", "birthday", "employee_id", "job", "job_title"];
    }
};

