const sidebarItems = [
    {
        title: 'Dashboard',
        path: '/',
        icon: (
            <svg className="w-4 h-4 mr-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
        ),
    },
    {
        title: 'Trip Management',
        package: 'trip',
        icon: (
            <svg className="w-4 h-4 mr-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
        ),
        subItems: [
            {
                title: 'Trips',
                path: '/trip',
            },
            {
                title: 'Schedule Trip',
                path: '/trip/create',
            }
        ]
    },
    {
        title: 'Manage Users',
        package: 'users',
        icon: (
            <svg className="w-4 h-4 mr-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
        ),
        subItems: [
            {
                title: 'Employees',
                path: '/users/employee',
            },
            {
                title: 'Suppliers',
                path: '/users/supplier',
            }
        ]
    },
];

export default sidebarItems;