import { useEffect, useState } from 'react';
import api from '../../api/axios';
import AgGrid from '../../components/AgGrid';

const Trip = () => {
    const [tripData, setTripData] = useState(null);

    const getTripData = async () => {
        try {
            const response = await api.get('/api/users/travel/trip', {
                headers: {
                    Authorization: `Bearer ${sessionStorage.getItem('token')}`,
                },
            });

            console.log('Trip response:', response.data);

            setTripData(response.data);
        } catch (error) {
            console.error('Error fetching trip data:', error);
        }
    };

    useEffect(() => {
        getTripData();
    }, []);

    const tripColumns = ["id", "date", "lorry_id", "route_id", "driver_id", "helper_id", "start_mileage", "end_mileage"];

    return (
        <div>
            <AgGrid rowData={tripData} columnDefProp={tripColumns} view={true} />
        </div>

    );
};

export default Trip;