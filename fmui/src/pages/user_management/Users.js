import { useEffect, useState } from 'react';
import api from '../../api/axios';
import { useParams } from 'react-router-dom';
import AgGrid from '../../components/AgGrid';
import { userTypeColumnDefs } from '../../utils/columnDefs';
import { ToastContainer, toast } from 'react-toastify';
import locals from '../../utils/locals';

const Users = () => {
    const [users, setUsers] = useState([]);
    const params = useParams();
    const userType = params?.userType;

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const response = await api.get(`/api/users/${userType}`, {
                    headers: {
                        Authorization: `Bearer ${sessionStorage.getItem('token')}`,
                    },
                });
                setUsers(response.data);
            } catch (error) {
                console.error('Error fetching users:', error);
                toast.error(locals.FetchError);
            }
        };

        fetchUsers();
    }, [userType]);


    return (
        <div>
            <h1>{userType.charAt(0).toUpperCase() + userType.slice(1)} Users</h1>
            <AgGrid rowData={users} columnDefProp={userTypeColumnDefs(userType)} view={true}/>
            <ToastContainer />
        </div>
    );

}

export default Users;