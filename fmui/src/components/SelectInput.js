const SelectInput = ({ name, label, value, onChange, options = [], divcss, labelcss, selectcss, placeholder }) => {
    return (
        <div className={`mb-4 ${divcss || ''}`}>
            <label className={`block text-gray-700 text-sm font-bold mb-2 ${labelcss || ''}`} htmlFor={name}>
                {label}
            </label>
            <select
                className={`shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline bg-white ${selectcss || ''}`}
                id={name}
                name={name}
                value={value}
                onChange={onChange}
            >
                <option value="">{placeholder || `Select ${label}`}</option>
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </div>
    );
};

export default SelectInput;
