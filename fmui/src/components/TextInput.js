

const TextInput = ({name, label, value, onChange, type = "text", divcss, labelcss, inputcss, placeholder }) => {
    return (
        <div className={`mb-4 ${divcss}`}>
            <label className={`block text-gray-700 text-sm font-bold mb-2 ${labelcss}`} htmlFor={name}>
                {label}
            </label>
            <input
                className={`shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline ${inputcss}`}
                id={name}
                name={name}
                type={type}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
            />
        </div>
    );
}

export default TextInput;