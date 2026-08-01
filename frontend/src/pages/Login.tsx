import { useState } from "react";
import Button from "../components/Button";
import TextInput from "../components/TextInput";
import locals from "../utils/locals";

const Login = () => {

    const [userInputs, setUserInputs] = useState({
        username: "",
        password: "",
    });

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {

    const { name, value } = e.target;

    setUserInputs(prevState => ({
        ...prevState,
        [name]: value
    }));
};

    const handleLogin = () => {
        // Handle login logic here
        console.log("Logging in with:", userInputs);
    }

  return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="w-full max-w-md p-8 bg-white rounded shadow-md">
            <h2 className="text-2xl font-bold mb-6 text-center">{locals.Login}</h2>
            <form>
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
                <Button
                    name={locals.SignIn}
                    onClick={handleLogin}
                />
            </form>
        </div>
    </div>
  );
}

export default Login;
                   