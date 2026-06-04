import { useEffect, useMemo, useRef } from "react";

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

    const downloadTranscript = () => {
        const blob = new Blob([jsonTranscript], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'transcript.json';
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

        <div className="flex justify-center border-t text-sm text-gray-600 max-h-[150px] overflow-y-auto p-2 scrollbar-thin">
            <button
                className="flex items-center border px-2 py-1 rounded-lg bg-green-400 text-white hover:bg-green-500"
                onClick={downloadTranscript}
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6 mr-1">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download transcript
            </button>
        </div>
    </>)
};
export default Transcript;
