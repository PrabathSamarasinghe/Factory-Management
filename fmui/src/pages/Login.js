import { useState } from "react";
import Button from "../components/Button";
import TextInput from "../components/TextInput";
import locals from "../utils/locals";
import api from "../api/axios";
import { toast } from "react-toastify";
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

    const handleLogin = async (e) => {
        if (e) e.preventDefault();
        
        if (!userInputs.username || !userInputs.password) {
            toast.warn("Please enter both username and password.");
            return;
        }

        setIsLoading(true);
        try {
            const response = await api.post("api/auth/login", userInputs);
            const { token } = response.data;

            sessionStorage.setItem("token", token);
            toast.success("Welcome back! Signed in successfully.");
            navigate("/");
        } catch (error) {
            console.error(error);
            toast.error(locals.LoginFailed || "Login failed. Please check your credentials.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden font-sans">
            {/* Ambient Background Accents */}
            <div className="absolute -top-40 -right-40 w-96 h-96 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-slate-700/20 rounded-full blur-3xl pointer-events-none" />

            <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center px-4">
                {/* Brand Header */}
                <div className="inline-flex items-center justify-center gap-2 mb-3">
                    <span className="w-3 h-3 rounded-full bg-red-500 ring-4 ring-red-500/20 animate-pulse"></span>
                    <span className="text-xl font-bold text-white tracking-wider">Galatura Finance</span>
                </div>
                <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
                    Factory Management Portal
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                    Sign in with your staff or administrator credentials to access operations
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4">
                <div className="bg-white py-8 px-6 shadow-2xl rounded-2xl sm:px-10 border border-slate-200">
                    <form onSubmit={handleLogin} className="space-y-4">
                        <TextInput
                            name="username"
                            label="Username"
                            placeholder="Enter your system username"
                            value={userInputs.username}
                            onChange={handleInputChange}
                            divcss="mb-0"
                            inputcss="py-2.5 text-sm"
                        />

                        <TextInput
                            name="password"
                            label="Password"
                            placeholder="••••••••"
                            type="password"
                            value={userInputs.password}
                            onChange={handleInputChange}
                            divcss="mb-0"
                            inputcss="py-2.5 text-sm"
                        />

                        <div className="pt-3">
                            <Button
                                name={isLoading ? "Authenticating..." : "Sign In to Console"}
                                onClick={handleLogin}
                                disabled={isLoading}
                                btncss="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50"
                            />
                        </div>
                    </form>

                    <div className="mt-6 pt-4 border-t border-slate-100 text-center">
                        <span className="text-[11px] text-slate-400">
                            Protected by Galatura Enterprise Access Gateway
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
