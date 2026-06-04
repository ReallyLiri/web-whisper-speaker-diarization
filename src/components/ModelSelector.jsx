const MODELS = {
    base: 'Faster',
    small: 'Medium (but smarter)',
    medium: 'Slower (but smartest)',
};

function ModelSelector({ model, setModel, ...props }) {
    const handleModelChange = (event) => {
        setModel(event.target.value);
    };

    return (
        <select
            {...props}
            value={model}
            onChange={handleModelChange}
        >
            {Object.entries(MODELS).map(([key, label]) => (
                <option key={key} value={key}>
                    {label}
                </option>
            ))}
        </select>
    );
}

export default ModelSelector;
