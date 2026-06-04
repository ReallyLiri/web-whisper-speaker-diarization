const MODELS = {
    base: 'מהיר יותר',
    small: 'בינוני (אך חכם יותר)',
    medium: 'איטי יותר (אך החכם ביותר)',
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
