import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import Modal from '../../components/Modal';
import TextInput from '../../components/TextInput';
import Button from '../../components/Button';

const UserDetailModal = ({ isOpen, onClose, userType, userId }) => {
    const [userDetails, setUserDetails] = useState(null);
    const [bankDetails, setBankDetails] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showBankForm, setShowBankForm] = useState(false);
    
    const { control, handleSubmit, formState: { isSubmitting } } = useForm();

    useEffect(() => {
        if (isOpen && userId) {
            fetchData();
        }
    }, [isOpen, userId]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const userRes = await api.get(`/api/users/${userType}/${userId}`);
            setUserDetails(userRes.data);
            
            const sysUserId = userRes.data.id || userRes.data.user_id;
            
            if (sysUserId) {
                try {
                    const bankRes = await api.get(`/api/users/bank/${sysUserId}`);
                    setBankDetails(bankRes.data);
                } catch (bankErr) {
                    if (bankErr.response && bankErr.response.status === 404) {
                        setBankDetails(null);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to fetch user details:', error);
            toast.error('Failed to fetch profile details');
        } finally {
            setLoading(false);
        }
    };

    const onBankSubmit = async (data) => {
        try {
            const sysUserId = userDetails.id || userDetails.user_id;
            await api.post('/api/users/bank', { ...data, user_id: sysUserId });
            toast.success('Bank details linked successfully');
            setShowBankForm(false);
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save bank details');
        }
    };

    if (!isOpen) return null;

    const capitalize = (str) => str ? str.charAt(0).toUpperCase() + str.slice(1) : '';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`${capitalize(userType)} Profile Details`}>
            <div className="space-y-5 text-slate-800">
                {loading ? (
                    <div className="text-center py-8 text-xs text-slate-400 animate-pulse">Loading profile record...</div>
                ) : (
                    <>
                        {/* Profile Header Badge */}
                        <div className="flex items-center gap-3.5 bg-slate-900 text-white p-4 rounded-xl shadow-xs">
                            <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-lg text-slate-200">
                                {userDetails?.name ? userDetails.name.substring(0, 2).toUpperCase() : 'US'}
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-base font-bold truncate leading-tight">{userDetails?.name || 'User Name'}</h3>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    {userType === 'employee' ? (userDetails?.job_title || userDetails?.job || 'Employee') : `Supplier #${userDetails?.custom_id || userDetails?.supplier_id || 'N/A'}`}
                                </p>
                            </div>
                        </div>

                        {/* General Details Grid */}
                        <div>
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">
                                Identification & General Info
                            </h4>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
                                <div>
                                    <span className="text-slate-400 font-semibold block text-[10px] uppercase">NIC Number</span>
                                    <span className="font-semibold text-slate-800">{userDetails?.nic_number || 'N/A'}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 font-semibold block text-[10px] uppercase">Date of Birth</span>
                                    <span className="font-semibold text-slate-800">{userDetails?.birthday || 'N/A'}</span>
                                </div>
                                {userType === 'employee' ? (
                                    <div>
                                        <span className="text-slate-400 font-semibold block text-[10px] uppercase">Job Department</span>
                                        <span className="font-semibold text-slate-800">{userDetails?.job || 'N/A'}</span>
                                    </div>
                                ) : (
                                    <div>
                                        <span className="text-slate-400 font-semibold block text-[10px] uppercase">Route Assigned</span>
                                        <span className="font-semibold text-slate-800">Route #{userDetails?.route_id || 'N/A'}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Bank Details Section */}
                        <div className="border-t border-slate-200 pt-4">
                            <div className="flex justify-between items-center mb-2.5">
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    Bank & Payment Account
                                </h4>
                            </div>

                            {bankDetails ? (
                                <div className="grid grid-cols-2 gap-3 bg-emerald-50/50 p-3.5 rounded-xl border border-emerald-200 text-xs">
                                    <div>
                                        <span className="text-slate-500 font-semibold block text-[10px] uppercase">Bank</span>
                                        <span className="font-bold text-slate-900">{bankDetails.bank}</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-500 font-semibold block text-[10px] uppercase">Account Number</span>
                                        <span className="font-mono font-bold text-slate-900">{bankDetails.account_number}</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-500 font-semibold block text-[10px] uppercase">Branch</span>
                                        <span className="font-medium text-slate-800">{bankDetails.branch}</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-500 font-semibold block text-[10px] uppercase">Account Name</span>
                                        <span className="font-medium text-slate-800">{bankDetails.name_in_account}</span>
                                    </div>
                                </div>
                            ) : (
                                !showBankForm ? (
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                                        <p className="text-xs text-slate-500 mb-2">No bank account linked to this record</p>
                                        <button 
                                            type="button"
                                            onClick={() => setShowBankForm(true)} 
                                            className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs"
                                        >
                                            + Link Bank Details
                                        </button>
                                    </div>
                                ) : (
                                    <form onSubmit={handleSubmit(onBankSubmit)} className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                            <Controller name="bank" control={control} rules={{ required: true }} render={({ field }) => (
                                                <TextInput name={field.name} label="Bank Name" value={field.value || ''} onChange={field.onChange} placeholder="e.g. Bank of Ceylon" divcss="mb-0" inputcss="py-1.5 text-xs" />
                                            )} />
                                            <Controller name="account_number" control={control} rules={{ required: true }} render={({ field }) => (
                                                <TextInput name={field.name} label="Account Number" value={field.value || ''} onChange={field.onChange} placeholder="e.g. 12345678" divcss="mb-0" inputcss="py-1.5 text-xs font-mono" />
                                            )} />
                                            <Controller name="branch" control={control} rules={{ required: true }} render={({ field }) => (
                                                <TextInput name={field.name} label="Branch" value={field.value || ''} onChange={field.onChange} placeholder="e.g. Pelmadulla" divcss="mb-0" inputcss="py-1.5 text-xs" />
                                            )} />
                                            <Controller name="name_in_account" control={control} rules={{ required: true }} render={({ field }) => (
                                                <TextInput name={field.name} label="Name in Account" value={field.value || ''} onChange={field.onChange} placeholder="Account Holder Name" divcss="mb-0" inputcss="py-1.5 text-xs" />
                                            )} />
                                        </div>
                                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                                            <button 
                                                type="button" 
                                                onClick={() => setShowBankForm(false)} 
                                                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-100"
                                            >
                                                Cancel
                                            </button>
                                            <Button 
                                                name={isSubmitting ? 'Saving...' : 'Save Bank Account'} 
                                                disabled={isSubmitting} 
                                                type="submit" 
                                                btncss="bg-slate-900 hover:bg-slate-800 text-white rounded-lg px-4 py-1.5 text-xs font-semibold" 
                                            />
                                        </div>
                                    </form>
                                )
                            )}
                        </div>
                    </>
                )}

                <div className="flex justify-end pt-3 border-t border-slate-200">
                    <button 
                        type="button" 
                        onClick={onClose} 
                        className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold rounded-xl transition-colors"
                    >
                        Close Window
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default UserDetailModal;
