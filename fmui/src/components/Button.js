
const Button = ({ name, onClick, divcss, btncss }) => {
    return (
        <div className={`flex items-center justify-between ${divcss}`}>
            <button
                className={`bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline ${btncss}`}
                type="button"
                onClick={onClick}
            >
                {name}
            </button>
        </div>
    );
}

export default Button;