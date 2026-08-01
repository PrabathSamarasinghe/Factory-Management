interface TextInputProps {
    name: string;
    label: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    type?: string;
    divcss?: string;
    labelcss?: string;
    inputcss?: string;
    placeholder?: string;
}

interface ButtonProps {
    name?: string;
    onClick: () => void;
    divcss?: string;
    btncss?: string;
}


export type {
    TextInputProps,
    ButtonProps
};