import { useEffect, useState } from 'react';
import api from '../api/axios';

const Home = () => {
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

    return (
        <div>
            <h1>Welcome to the Home Page</h1>

            {tripData ? (
                <div>
                    <h2>Trip Data:</h2>
                    <pre>
                        {JSON.stringify(tripData, null, 2)}
                    </pre>
                </div>
            ) : (
                <p>Loading trip data...</p>
            )}
        </div>
    );
};

export default Home;