import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import locals from '../../utils/locals';
import TextInput from '../../components/TextInput';
import SelectInput from '../../components/SelectInput';
import Button from '../../components/Button';

const CreateBoughtLeaf = () => {
    const navigate = useNavigate();
    const [suppliers, setSuppliers] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        supplier_id: '',
        weight: '',
        water_deduction: '',
        tare_deduction: ''
    });

    useEffect(() => {
        const fetchSuppliers = async () => {
            try {
                const response = await api.get('/api/users/supplier');
                const options = (response.data || []).map(supplier => ({
                    value: supplier.id || supplier.supplier_id,
                    label: `${supplier.name} (${supplier.custom_id || supplier.supplier_id || 'ID#' + supplier.id})`
                }));
                setSuppliers(options);
            } catch (error) {
                console.error('Error fetching suppliers:', error);
                toast.error('Failed to load supplier directory');
            }
        };
        fetchSuppliers();
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSelectChange = (name, value) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.supplier_id) {
            toast.warn('Please select a registered supplier.');
            return;
        }

        if (!formData.weight || parseFloat(formData.weight) <= 0) {
            toast.warn('Please enter a valid gross weight.');
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = {
                supplier_id: parseInt(formData.supplier_id, 10),
                weight: parseFloat(formData.weight) || 0,
                water_deduction: parseFloat(formData.water_deduction) || 0,
                tare_deduction: parseFloat(formData.tare_deduction) || 0
            };

            await api.post('/api/bought-leaf', payload);
            toast.success('Bought leaf batch intake recorded successfully!');
            navigate('/bought-leaf');
        } catch (error) {
            console.error('Error recording entry:', error);
            toast.error(error.response?.data?.message || 'Failed to record entry');
        } finally {
            setIsSubmitting(false);
        }
    };

    const grossWeight = parseFloat(formData.weight) || 0;
    const waterDeduction = parseFloat(formData.water_deduction) || 0;
    const tareDeduction = parseFloat(formData.tare_deduction) || 0;
    const totalDeductions = waterDeduction + tareDeduction;
    const netWeight = Math.max(0, grossWeight - totalDeductions);

    return (
        <div className="max-w-4xl mx-auto space-y-6 text-slate-800 font-sans pb-10">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-300">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Record Bought Leaf Batch</h1>
                    <p className="text-xs text-slate-500 mt-1">{locals.RecordBoughtLeafDesc || 'Enter daily green leaf intake and deduction measurements.'}</p>
                </div>
                <Link
                    to="/bought-leaf"
                    className="text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 px-3.5 py-2 rounded-xl shadow-xs transition-colors"
                >
                    ← Back to Summary
                </Link>
            </div>

            {/* Form Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden ring-1 ring-slate-900/5">
                <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-sm">
                            🍃
                        </div>
                        <div>
                            <h2 className="text-base font-semibold">Weighment & Deduction Form</h2>
                            <p className="text-xs text-slate-400">Accurately record supplier gross intake and tare weights</p>
                        </div>
                    </div>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    
                    <div className="space-y-4">
                        <SelectInput
                            name="supplier_id"
                            label="Select Supplier *"
                            value={formData.supplier_id}
                            onChange={(e) => handleSelectChange('supplier_id', e.target.value)}
                            options={suppliers}
                            placeholder="Search & choose supplier from directory"
                            divcss="mb-0"
                        />

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <TextInput
                                name="weight"
                                label="Gross Weight (kg) *"
                                type="number"
                                step="0.1"
                                placeholder="e.g. 150.5"
                                value={formData.weight}
                                onChange={handleChange}
                                divcss="mb-0"
                            />

                            <TextInput
                                name="water_deduction"
                                label="Water Deduction (kg)"
                                type="number"
                                step="0.1"
                                placeholder="e.g. 5.0"
                                value={formData.water_deduction}
                                onChange={handleChange}
                                divcss="mb-0"
                            />

                            <TextInput
                                name="tare_deduction"
                                label="Tare / Bag Deduction (kg)"
                                type="number"
                                step="0.1"
                                placeholder="e.g. 10.0"
                                value={formData.tare_deduction}
                                onChange={handleChange}
                                divcss="mb-0"
                            />
                        </div>
                    </div>

                    {/* Live Yield Calculation Banner */}
                    <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                                <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
                                    Calculated Net Tea Leaf Yield
                                </span>
                                <div className="text-2xl font-black text-emerald-900 mt-0.5">
                                    {netWeight.toFixed(2)} kg
                                </div>
                            </div>

                            <div className="text-xs text-slate-600 bg-white/80 p-2.5 rounded-lg border border-emerald-100 font-mono space-y-1">
                                <div>Gross Weight: <span className="font-bold text-slate-800">{grossWeight.toFixed(2)} kg</span></div>
                                <div className="text-amber-700">Total Deductions: <span className="font-bold">-{totalDeductions.toFixed(2)} kg</span></div>
                            </div>
                        </div>
                    </div>

                    {/* Submit Section */}
                    <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                        <Link 
                            to="/bought-leaf" 
                            className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors flex items-center"
                        >
                            Cancel
                        </Link>
                        <Button 
                            name={isSubmitting ? "Recording Intake..." : "Submit Weighment Record"} 
                            onClick={handleSubmit} 
                            disabled={isSubmitting || !formData.supplier_id || !formData.weight}
                            btncss="bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-sm px-6 py-2.5 text-xs font-semibold disabled:opacity-50"
                        />
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateBoughtLeaf;
