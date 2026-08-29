import React, { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import TextInput from '../../components/TextInput';
import Button from '../../components/Button';
import api from '../../api/axios';
import { toast } from 'react-toastify';

const RouteFormModal = ({ isOpen, onClose, onSuccess }) => {
    const [lineName, setLineName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setLineName('');
        }
    }, [isOpen]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!lineName.trim()) {
            toast.warn('Please enter a valid line / route name.');
            return;
        }

        setIsSubmitting(true);

        const payload = {
            line_name: lineName.trim()
        };

        try {
            await api.post('/api/users/travel/route', payload);
            toast.success('New collection route added successfully');
            onSuccess();
            onClose();
        } catch (error) {
            console.error('Error creating route:', error);
            toast.error(error.response?.data?.message || 'Failed to create route');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Add New Collection Route">
            <form onSubmit={handleSubmit} className="space-y-4 text-xs font-medium text-slate-700">
                <TextInput
                    label="Route / Line Name *"
                    name="line_name"
                    value={lineName}
                    onChange={(e) => setLineName(e.target.value)}
                    placeholder="e.g. Line 04 - Kahawatta Valley"
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
                        name={isSubmitting ? "Creating..." : "Save Route"} 
                        onClick={handleSubmit} 
                        disabled={isSubmitting || !lineName.trim()}
                        btncss="bg-slate-900 hover:bg-slate-800 text-white rounded-xl px-5 py-2"
                    />
                </div>
            </form>
        </Modal>
    );
};

export default RouteFormModal;
