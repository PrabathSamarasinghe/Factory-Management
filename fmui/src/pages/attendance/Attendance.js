import React, { useEffect, useState, useMemo } from 'react';
import dayjs from 'dayjs';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { attendanceColumns } from '../../utils/columnDefs';
import AgGrid from '../../components/AgGrid';

const Attendance = () => {
    const [attendanceData, setAttendanceData] = useState([]);
    const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
    const [searchTerm, setSearchTerm] = useState('');
    const [isPunching, setIsPunching] = useState(false);

    const fetchAttendance = async () => {
        try {
            const response = await api.get('/api/attendance');
            setAttendanceData(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            console.error('Error fetching attendance:', error);
            toast.error('Failed to fetch attendance data');
        }
    };

    useEffect(() => {
        fetchAttendance();
    }, [date]);

    const handleCheckInOut = async (data) => {
        const employeeId = data.id || data.employee_id;
        if (!employeeId) {
            toast.error('Employee ID not found in row data');
            return;
        }

        setIsPunching(true);
        try {
            await api.post(`/api/attendance/${employeeId}`);
            toast.success(`Attendance toggled for Staff #${employeeId}`);
            fetchAttendance();
        } catch (error) {
            console.error('Error in check in/out:', error);
            toast.error('Failed to record attendance punch');
        } finally {
            setIsPunching(false);
        }
    };

    // Metrics
    const totalRecords = attendanceData.length;
    const clockedInCount = attendanceData.filter(a => a.in_time && !a.out_time).length;
    const completedShifts = attendanceData.filter(a => a.out_time).length;
    const totalPresent = clockedInCount + completedShifts;

    const filteredData = useMemo(() => {
        if (!searchTerm) return attendanceData;
        const term = searchTerm.toLowerCase();
        return attendanceData.filter(a => 
            (a.name && a.name.toLowerCase().includes(term)) ||
            (a.employee_id && a.employee_id.toString().includes(term)) ||
            (a.status && a.status.toLowerCase().includes(term))
        );
    }, [attendanceData, searchTerm]);

    return (
        <div className="max-w-7xl mx-auto space-y-6 text-slate-800 font-sans pb-10">
            
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-300">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Daily Workforce Attendance</h1>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                            {dayjs(date).format('MMMM D, YYYY')}
                        </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                        Monitor daily employee clock-ins, shift completions, and log punch overrides.
                    </p>
                </div>

                {/* Date Selection Toolbar */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setDate(dayjs().format('YYYY-MM-DD'))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                            date === dayjs().format('YYYY-MM-DD')
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                    >
                        Today
                    </button>
                    <button
                        onClick={() => setDate(dayjs().subtract(1, 'day').format('YYYY-MM-DD'))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                            date === dayjs().subtract(1, 'day').format('YYYY-MM-DD')
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                    >
                        Yesterday
                    </button>
                    <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-medium focus:outline-none focus:ring-1 focus:ring-slate-400"
                    />
                </div>
            </div>

            {/* KPI Ribbon */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <span className="text-xs text-slate-500 font-semibold uppercase">Total Present</span>
                        <div className="text-xl font-bold text-slate-900 mt-0.5">{totalPresent} / {totalRecords || totalPresent}</div>
                    </div>
                    <div className="p-2.5 rounded-xl text-lg bg-purple-50 text-purple-600">
                        👥
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <span className="text-xs text-slate-500 font-semibold uppercase">Active On Shift</span>
                        <div className="text-xl font-bold text-emerald-600 mt-0.5 flex items-center gap-2">
                            <span>{clockedInCount} Staff</span>
                            {clockedInCount > 0 && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>}
                        </div>
                    </div>
                    <div className="p-2.5 rounded-xl text-lg bg-emerald-50 text-emerald-600">
                        ⏱️
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <span className="text-xs text-slate-500 font-semibold uppercase">Search Workforce</span>
                        <div className="text-xs text-slate-400 mt-1">{filteredData.length} records found</div>
                    </div>
                    <input
                        type="text"
                        placeholder="Search employee..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400 w-36"
                    />
                </div>
            </div>

            {/* Main Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4">
                <div className="mb-2 flex items-center justify-between px-1">
                    <span className="text-xs text-slate-500">
                        Click the eye icon to trigger an automated <span className="font-semibold text-slate-700">Check In / Out</span> toggle for any employee.
                    </span>
                    {isPunching && <span className="text-xs text-purple-600 font-semibold animate-pulse">Recording punch...</span>}
                </div>
                <AgGrid
                    rowData={filteredData}
                    columnDefProp={attendanceColumns}
                    view={true}
                    onView={handleCheckInOut}
                    fileName="attendance-log"
                />
            </div>
        </div>
    );
};

export default Attendance;
