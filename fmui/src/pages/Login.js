import { useState } from "react";
import Button from "../components/Button";
import TextInput from "../components/TextInput";
import locals from "../utils/locals";

import api from "../api/axios";
import { ToastContainer, toast } from "react-toastify";

import { useNavigate } from "react-router-dom";


const Login = () => {
    const navigate = useNavigate();

    const [userInputs, setUserInputs] = useState({
        username: "",
        password: "",
    });

    const [isLoading, setIsLoading] = useState(false);

    const handleInputChange = (e) => {

        const { name, value } = e.target;

        setUserInputs(prevState => ({
            ...prevState,
            [name]: value
        }));
    };

    const handleLogin = async () => {
        setIsLoading(true);
        try {
            console.log(userInputs);

            const response = await api.post("api/auth/login", userInputs);

            const { token } = response.data;

            sessionStorage.setItem("token", token);

            if (response.status === 200) {
                navigate("/");
            }

        } catch (error) {
            console.error(error);

            toast.error(locals.LoginFailed, {
                position: "top-right",
                autoClose: 5000,
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50">
            <div className="w-full max-w-md p-10 bg-white rounded-2xl shadow-xl shadow-slate-100 border border-slate-100/80">
                {/* Modernized Heading styling */}
                <h2 className="text-3xl font-extrabold mb-8 text-center text-slate-800 tracking-tight">
                    {locals.Login}
                </h2>

                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleLogin();
                    }}
                    className="space-y-5"
                >
                    <TextInput
                        name="username"
                        label={locals.Username}
                        placeholder={locals.EnterUsername}
                        value={userInputs.username}
                        onChange={handleInputChange}
                    />

                    <TextInput
                        name="password"
                        label={locals.Password}
                        placeholder={locals.EnterPassword}
                        type="password"
                        value={userInputs.password}
                        onChange={handleInputChange}
                    />

                    <div className="pt-2">
                        <Button
                            name={isLoading ? locals.SigningIn : locals.SignIn}
                            onClick={handleLogin}
                            disabled={isLoading}
                        />
                    </div>

                    <ToastContainer />
                </form>
            </div>
        </div>
    );
}

export default Login;
