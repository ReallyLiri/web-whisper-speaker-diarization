import { useEffect, useMemo, useRef, useState } from "react";

const Chunk = ({ chunk, currentTime, onClick, ...props }) => {
    const spanRef = useRef(null);
    const { text, timestamp } = chunk;
    const [start, end] = timestamp;

    const bolded = start <= currentTime && currentTime < end;

    useEffect(() => {
        if (spanRef.current && bolded) { // scroll into view
            spanRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'center',
            });
        }
    }, [bolded]);

    return (
        <span {...props}>
            {text.startsWith(' ') ? " " : ""}
            <span
                ref={spanRef}
                onClick={onClick}
                className="text-md text-gray-600 cursor-pointer hover:text-red-600"
                title={timestamp.map(x => x.toFixed(2)).join(' → ')}
                style={{
                    textDecoration: bolded ? 'underline' : 'none',
                    textShadow: bolded ? '0 0 1px #000' : 'none',
                }}
            >{text.trim()}</span>
        </span>
    )
}

const Transcript = ({ transcript, segments, currentTime, setCurrentTime, ...props }) => {
    const jsonTranscript = useMemo(() => {
        return JSON.stringify({
            ...transcript,
            segments,
        }, null, 2)
            // post-process the JSON to make it more readable
            .replace(/( {4}"timestamp": )\[\s+(\S+)\s+(\S+)\s+\]/gm, "$1[$2 $3]");
    }, [transcript, segments]);

    // Post-process the transcript to highlight speaker changes
    const postProcessedTranscript = useMemo(() => {
        let prev = 0;
        const words = transcript.chunks;

        const result = [];
        for (const segment of segments) {
            const { label, end } = segment;
            if (label === 'NO_SPEAKER') continue;

            // Collect all words within this segment
            const segmentWords = [];
            for (let i = prev; i < words.length; ++i) {
                const word = words[i];
                if (word.timestamp[1] <= end) {
                    segmentWords.push(word);
                } else {
                    prev = i;
                    break;
                }
            }
            if (segmentWords.length > 0) {
                result.push({
                    ...segment,
                    chunks: segmentWords,
                })
            }
        }
        return result;
    }, [transcript, segments]);

    const [copied, setCopied] = useState(false);

    const buildText = () => postProcessedTranscript.map(({ label, chunks }) => {
        const line = chunks.map(c => c.text).join('').trim();
        return `${label}:\n${line}`;
    }).join('\n\n');

    const copyToClipboard = () => {
        navigator.clipboard.writeText(buildText()).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const downloadTranscript = () => {
        const text = buildText();
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'transcript.txt';
        a.click();
        URL.revokeObjectURL(url);
    }

    return (<>
        <div {...props}>
            {
                postProcessedTranscript.map(({ label, start, end, chunks }, i) => (
                    <div className="border-t py-2" key={i}>
                        <div className="flex justify-between">
                            <label className="text-xs font-medium">{label}</label>
                            <label className="text-xs">{start.toFixed(2)} &rarr; {end.toFixed(2)}</label>
                        </div>
                        <div>
                            {chunks.map((chunk, j) =>
                                <Chunk
                                    key={j}
                                    chunk={chunk}
                                    currentTime={currentTime}
                                    onClick={() => setCurrentTime(chunk.timestamp[0])}  // Set to start of chunk
                                />
                            )}
                        </div>
                    </div>
                ))
            }
        </div>

        <div className="flex justify-center gap-2 border-t text-sm text-gray-600 max-h-[150px] overflow-y-auto p-2 scrollbar-thin">
            <button
                className="flex items-center border px-2 py-1 rounded-lg bg-green-400 text-white hover:bg-green-500"
                onClick={downloadTranscript}
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6 mr-1">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download transcript
            </button>
            <button
                className="flex items-center border px-2 py-1 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
                onClick={copyToClipboard}
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6 mr-1">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                </svg>
                {copied ? 'Copied!' : 'Copy to clipboard'}
            </button>
        </div>
    </>)
};
export default Transcript;
