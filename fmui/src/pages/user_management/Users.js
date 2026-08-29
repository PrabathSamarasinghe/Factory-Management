import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import AgGrid from '../../components/AgGrid';
import { userTypeColumnDefs } from '../../utils/columnDefs';
import UserFormModal from './UserFormModal';
import UserDetailModal from './UserDetailModal';

const Users = () => {
    const { userType } = useParams();
    const [users, setUsers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [editMode, setEditMode] = useState(false);
    const [loading, setLoading] = useState(false);

    const isEmployee = userType === 'employee';

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const response = await api.get(`/api/users/${userType}`);
            setUsers(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            console.error(`Failed to fetch ${userType}s:`, error);
            toast.error(`Failed to fetch ${userType}s list`);
        } finally {
            setLoading(false);
        }
    }, [userType]);

    useEffect(() => {
        if (userType) {
            setSearchTerm('');
            fetchUsers();
        }
    }, [userType, fetchUsers]);

    const handleAdd = () => {
        setSelectedUser(null);
        setEditMode(false);
        setIsFormModalOpen(true);
    };

    const handleEdit = (data) => {
        setSelectedUser(data);
        setEditMode(true);
        setIsFormModalOpen(true);
    };

    const handleView = (data) => {
        setSelectedUser(data);
        setIsDetailModalOpen(true);
    };

    const capitalize = (str) => str ? str.charAt(0).toUpperCase() + str.slice(1) : '';

    // Filter users by search term
    const filteredUsers = useMemo(() => {
        if (!searchTerm) return users;
        const term = searchTerm.toLowerCase();
        return users.filter(u => 
            (u.name && u.name.toLowerCase().includes(term)) ||
            (u.nic_number && u.nic_number.toLowerCase().includes(term)) ||
            (u.job && u.job.toLowerCase().includes(term)) ||
            (u.custom_id && u.custom_id.toLowerCase().includes(term))
        );
    }, [users, searchTerm]);

    return (
        <div className="max-w-7xl mx-auto space-y-6 text-slate-800 font-sans pb-10">
            
            {/* Header with Stats & Actions */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-300">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
                            {capitalize(userType)} Directory
                        </h1>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            isEmployee ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}>
                            {users.length} Registered {capitalize(userType)}s
                        </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                        Manage factory {userType} profiles, identification records, and payment credentials.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleAdd}
                        className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl shadow-sm hover:shadow-md transition-all text-xs font-semibold"
                    >
                        <span>+ Add {capitalize(userType)}</span>
                    </button>
                </div>
            </div>

            {/* Quick KPI Ribbon */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <span className="text-xs text-slate-500 font-semibold uppercase">Total {capitalize(userType)}s</span>
                        <div className="text-xl font-bold text-slate-900 mt-0.5">{users.length}</div>
                    </div>
                    <div className={`p-2.5 rounded-xl text-lg ${isEmployee ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
                        {isEmployee ? '👤' : '🌱'}
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <span className="text-xs text-slate-500 font-semibold uppercase">Active Status</span>
                        <div className="text-xl font-bold text-emerald-600 mt-0.5">100% Operational</div>
                    </div>
                    <div className="p-2.5 rounded-xl text-lg bg-emerald-50 text-emerald-600">
                        ✓
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <span className="text-xs text-slate-500 font-semibold uppercase">Search Filter</span>
                        <div className="text-xs text-slate-400 mt-1">{filteredUsers.length} matches found</div>
                    </div>
                    <input
                        type="text"
                        placeholder={`Search ${userType}s...`}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400 w-36"
                    />
                </div>
            </div>

            {/* Main Data Grid */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4">
                <AgGrid
                    rowData={filteredUsers}
                    columnDefProp={userTypeColumnDefs(userType)}
                    onView={handleView}
                    onEdit={handleEdit}
                    fileName={`${userType}-directory`}
                />
            </div>

            {isFormModalOpen && (
                <UserFormModal
                    isOpen={isFormModalOpen}
                    onClose={() => setIsFormModalOpen(false)}
                    userType={userType}
                    editData={editMode ? selectedUser : null}
                    onSuccess={fetchUsers}
                />
            )}

            {isDetailModalOpen && (
                <UserDetailModal
                    isOpen={isDetailModalOpen}
                    onClose={() => setIsDetailModalOpen(false)}
                    userType={userType}
                    userId={userType === 'employee' ? selectedUser?.employee_id || selectedUser?.id : selectedUser?.supplier_id || selectedUser?.id}
                />
            )}
        </div>
    );
};

export default Users;