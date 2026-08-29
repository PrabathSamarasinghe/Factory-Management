import React, { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import TextInput from '../../components/TextInput';
import Button from '../../components/Button';
import api from '../../api/axios';
import { toast } from 'react-toastify';

const LorryFormModal = ({ isOpen, onClose, editData, onSuccess }) => {
    const [lorryNumber, setLorryNumber] = useState('');
    const [mileage, setMileage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (editData) {
            setLorryNumber(editData.lorry_number || '');
            setMileage(editData.mileage?.toString() || '');
        } else {
            setLorryNumber('');
            setMileage('');
        }
    }, [editData, isOpen]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!lorryNumber || !mileage) {
            toast.warn('Please fill in both the registration number and mileage.');
            return;
        }

        setIsSubmitting(true);

        const payload = {
            lorry_number: lorryNumber.trim().toUpperCase(),
            mileage: parseInt(mileage, 10)
        };

        try {
            if (editData) {
                payload.lorry_id = editData.id;
                await api.patch('/api/users/travel/lorry', payload);
                toast.success('Lorry details updated successfully');
            } else {
                await api.post('/api/users/travel/lorry', payload);
                toast.success('New lorry registered in fleet');
            }
            onSuccess();
            onClose();
        } catch (error) {
            console.error('Error saving lorry:', error);
            toast.error(error.response?.data?.message || 'Failed to save lorry');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={editData ? 'Edit Lorry Details' : 'Register New Lorry'}>
            <form onSubmit={handleSubmit} className="space-y-4 text-xs font-medium text-slate-700">
                <TextInput
                    label="Registration Number / License Plate *"
                    name="lorry_number"
                    value={lorryNumber}
                    onChange={(e) => setLorryNumber(e.target.value)}
                    placeholder="e.g. WP-GA-1234"
                    divcss="mb-0"
                />
                
                <TextInput
                    label="Current Recorded Mileage (km) *"
                    name="mileage"
                    type="number"
                    value={mileage}
                    onChange={(e) => setMileage(e.target.value)}
                    placeholder="e.g. 14500"
                    divcss="mb-0"
                />

                <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200">
                    <button 
                        type="button" 
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
                        disabled={isSubmitting}
                    >
                        Cancel
                    </button>
                    <Button 
                        name={isSubmitting ? "Saving..." : (editData ? "Update Lorry" : "Register Lorry")} 
                        onClick={handleSubmit} 
                        disabled={isSubmitting || !lorryNumber || !mileage}
                        btncss="bg-slate-900 hover:bg-slate-800 text-white rounded-xl px-5 py-2"
                    />
                </div>
            </form>
        </Modal>
    );
};

export default LorryFormModal;
