import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import Modal from '../../components/Modal';
import TextInput from '../../components/TextInput';
import SelectInput from '../../components/SelectInput';
import Button from '../../components/Button';

const UserFormModal = ({ isOpen, onClose, userType, editData, onSuccess }) => {
    const isEdit = !!editData;
    const { control, handleSubmit, setValue, reset, formState: { isSubmitting } } = useForm();
    const [routes, setRoutes] = useState([]);

    const capitalize = (str) => str ? str.charAt(0).toUpperCase() + str.slice(1) : '';

    useEffect(() => {
        if (isOpen) {
            if (isEdit && editData) {
                Object.keys(editData).forEach(key => {
                    setValue(key, editData[key]);
                });
            } else {
                reset({
                    name: '',
                    nic_number: '',
                    birthday: '',
                    photo_url: '',
                    nic_url: '',
                    job: '',
                    job_title: '',
                    custom_id: '',
                    route_id: ''
                });
            }

            if (userType === 'supplier') {
                fetchRoutes();
            }
        }
    }, [isOpen, isEdit, editData, userType, setValue, reset]);

    const fetchRoutes = async () => {
        try {
            const res = await api.get('/api/users/travel/route');
            setRoutes(res.data.map(r => ({ value: r.id, label: r.line_name })));
        } catch (error) {
            console.error('Failed to fetch routes:', error);
        }
    };

    const onSubmit = async (data) => {
        try {
            if (isEdit) {
                const id = userType === 'employee' ? editData.employee_id || editData.id : editData.supplier_id || editData.id;
                await api.patch(`/api/users/${userType}/${id}`, data);
                toast.success(`${capitalize(userType)} updated successfully`);
            } else {
                await api.post(`/api/users/${userType}`, data);
                toast.success(`${capitalize(userType)} registered successfully`);
            }
            onSuccess();
            onClose();
        } catch (error) {
            toast.error(error.response?.data?.message || `Failed to save ${userType}`);
        }
    };

    const title = `${isEdit ? 'Edit' : 'Register New'} ${capitalize(userType)}`;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 text-xs font-medium text-slate-700">
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="sm:col-span-2">
                        <Controller name="name" control={control} rules={{ required: true }} render={({ field }) => (
                            <TextInput name={field.name} label="Full Name *" value={field.value || ''} onChange={field.onChange} placeholder="e.g. Sunil Perera" divcss="mb-0" />
                        )} />
                    </div>

                    <Controller name="nic_number" control={control} rules={{ required: true }} render={({ field }) => (
                        <TextInput name={field.name} label="NIC / Identification *" value={field.value || ''} onChange={field.onChange} placeholder="e.g. 198512345678" divcss="mb-0" />
                    )} />

                    <Controller name="birthday" control={control} rules={{ required: true }} render={({ field }) => (
                        <TextInput name={field.name} label="Date of Birth *" type="date" value={field.value || ''} onChange={field.onChange} divcss="mb-0" />
                    )} />

                    {userType === 'employee' && (
                        <>
                            <Controller name="job" control={control} rules={{ required: true }} render={({ field }) => (
                                <TextInput name={field.name} label="Job Category *" value={field.value || ''} onChange={field.onChange} placeholder="e.g. Driver, Helper, Operator" divcss="mb-0" />
                            )} />
                            <Controller name="job_title" control={control} rules={{ required: true }} render={({ field }) => (
                                <TextInput name={field.name} label="Job Title / Role *" value={field.value || ''} onChange={field.onChange} placeholder="e.g. Senior Delivery Driver" divcss="mb-0" />
                            )} />
                        </>
                    )}

                    {userType === 'supplier' && (
                        <>
                            <Controller name="custom_id" control={control} rules={{ required: true }} render={({ field }) => (
                                <TextInput name={field.name} label="Supplier Code / Custom ID *" value={field.value || ''} onChange={field.onChange} placeholder="e.g. SUP-042" divcss="mb-0" />
                            )} />
                            <Controller name="route_id" control={control} rules={{ required: true }} render={({ field }) => (
                                <SelectInput name={field.name} label="Collection Route *" value={field.value || ''} onChange={field.onChange} options={routes} placeholder="Select Route" divcss="mb-0" />
                            )} />
                        </>
                    )}

                    <Controller name="photo_url" control={control} render={({ field }) => (
                        <TextInput name={field.name} label="Profile Photo URL (Optional)" value={field.value || ''} onChange={field.onChange} placeholder="https://..." divcss="mb-0" />
                    )} />

                    <Controller name="nic_url" control={control} render={({ field }) => (
                        <TextInput name={field.name} label="NIC Document URL (Optional)" value={field.value || ''} onChange={field.onChange} placeholder="https://..." divcss="mb-0" />
                    )} />
                </div>

                <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200 mt-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <Button 
                        name={isSubmitting ? 'Saving Record...' : (isEdit ? 'Update Details' : 'Register Profile')} 
                        disabled={isSubmitting} 
                        type="submit" 
                        btncss="bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl px-5 py-2" 
                    />
                </div>
            </form>
        </Modal>
    );
};

export default UserFormModal;
