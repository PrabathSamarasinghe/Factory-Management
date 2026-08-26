
const Button = ({ name, onClick, divcss, btncss, disabled }) => {
    return (
        <div className={`flex items-center justify-between ${divcss}`}>
            <button
                className={`w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl transition-all duration-200 shadow-sm shadow-slate-900/10 cursor-pointer ${btncss} ${disabled ? "bg-slate-300 opacity-50 cursor-not-allowed" : ""}`}
                type="button"
                onClick={onClick}
                disabled={disabled}
            >
                {name}
            </button>
        </div>
    );
}

export default Button;