import { useEffect, useState } from 'react';
import api from '../../api/axios';
import AgGrid from '../../components/AgGrid';
import { ToastContainer, toast } from 'react-toastify';
import locals from '../../utils/locals';
import { tripColumns } from '../../utils/columnDefs';

const Trip = () => {
    const [tripData, setTripData] = useState(null);

    const getTripData = async () => {
        try {
            const response = await api.get('/api/users/travel/trip', {
                headers: {
                    Authorization: `Bearer ${sessionStorage.getItem('token')}`,
                },
            });
            setTripData(response.data);
        } catch (error) {
            console.error('Error fetching trip data:', error);
            toast.error(locals.FetchError);
        }
    };

    useEffect(() => {
        getTripData();
    }, []);


    return (
        <div>
            <AgGrid rowData={tripData} columnDefProp={tripColumns} view={true} />
            <ToastContainer />
        </div>

    );
};

export default Trip;