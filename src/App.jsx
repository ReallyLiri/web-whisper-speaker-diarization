import {useEffect, useState, useRef, useCallback} from 'react';

import Progress from './components/Progress';
import MediaInput from './components/MediaInput';
import Transcript from './components/Transcript';
import LanguageSelector from './components/LanguageSelector';
import ModelSelector from './components/ModelSelector';


async function hasWebGPU() {
    if (!navigator.gpu) {
        return false;
    }
    try {
        const adapter = await navigator.gpu.requestAdapter();
        return !!adapter;
    } catch (e) {
        return false;
    }
}

const STORAGE_KEYS = {
    language: 'whisper-speaker-diarization.language',
    model: 'whisper-speaker-diarization.model',
};

function readStoredValue(key, fallback) {
    try {
        return localStorage.getItem(key) ?? fallback;
    } catch {
        return fallback;
    }
}

function App() {

    // Create a reference to the worker object.
    const worker = useRef(null);

    // Model loading and progress
    const [status, setStatus] = useState('ready');
    const [loadingMessage, setLoadingMessage] = useState('טוענת מודלים...');
    const [progressItems, setProgressItems] = useState([]);
    const [feedback, setFeedback] = useState(null);

    const mediaInputRef = useRef(null);
    const [audio, setAudio] = useState(null);
    const [language, setLanguage] = useState(() => readStoredValue(STORAGE_KEYS.language, 'he'));
    const [model, setModel] = useState(() => readStoredValue(STORAGE_KEYS.model, 'base'));

    const [result, setResult] = useState(null);
    const [time, setTime] = useState(null);
    const [currentTime, setCurrentTime] = useState(0);

    const [device, setDevice] = useState(null);
    useEffect(() => {
        hasWebGPU().then((b) => {
            setDevice(b ? 'webgpu' : 'wasm');
        });
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEYS.language, language);
        } catch {}
    }, [language]);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEYS.model, model);
        } catch {}
    }, [model]);

    // We use the `useEffect` hook to setup the worker as soon as the `App` component is mounted.
    useEffect(() => {
        if (!worker.current) {
            // Create the worker if it does not yet exist.
            worker.current = new Worker(new URL('./worker.js', import.meta.url), {
                type: 'module'
            });
        }

        // Create a callback function for messages from the worker thread.
        const onMessageReceived = (e) => {
            switch (e.data.status) {
                case 'loading':
                    // Model file start load: add a new progress item to the list.
                    setStatus('loading');
                    setLoadingMessage(e.data.data ?? 'טוענת מודלים...');
                    break;

                case 'initiate':
                    setProgressItems(prev => [...prev, e.data]);
                    break;

                case 'progress':
                    // Model file progress: update one of the progress items.
                    setProgressItems(
                        prev => prev.map(item => {
                            if (item.file === e.data.file) {
                                return {...item, ...e.data}
                            }
                            return item;
                        })
                    );
                    break;

                case 'done':
                    // Model file loaded: remove the progress item from the list.
                    setProgressItems(
                        prev => prev.filter(item => item.file !== e.data.file)
                    );
                    break;

                case 'running':
                    setProgressItems([]);
                    setStatus('running');
                    break;

                case 'complete':
                    setResult(e.data.result);
                    setTime(e.data.time);
                    setProgressItems([]);
                    setStatus('ready');
                    break;

                case 'cleared':
                    setFeedback({
                        type: 'success',
                        text: e.data.cacheDeleted ? 'אחסון מודלים מקומי נוקה.' : 'לא נמצא אחסון מודלים מקומי.',
                    });
                    setProgressItems([]);
                    setStatus('ready');
                    break;

                case 'error':
                    setFeedback({
                        type: 'error',
                        text: e.data.error || 'אירעה שגיאה לא ידועה.',
                    });
                    setProgressItems([]);
                    setStatus('ready');
                    break;
            }
        };

        const onWorkerError = (event) => {
            setFeedback({
                type: 'error',
                text: event.message || 'עובד המודל קרס.',
            });
            setProgressItems([]);
            setStatus('ready');
        };

        const onMessageError = () => {
            setFeedback({
                type: 'error',
                text: 'עובד המודל שלח תגובה בלתי קריאה.',
            });
            setProgressItems([]);
            setStatus('ready');
        };

        // Attach the callback function as an event listener.
        worker.current.addEventListener('message', onMessageReceived);
        worker.current.addEventListener('error', onWorkerError);
        worker.current.addEventListener('messageerror', onMessageError);

        // Define a cleanup function for when the component is unmounted.
        return () => {
            worker.current.removeEventListener('message', onMessageReceived);
            worker.current.removeEventListener('error', onWorkerError);
            worker.current.removeEventListener('messageerror', onMessageError);
        };
    }, []);

    const handleClick = useCallback(() => {
        if (!worker.current || !device || audio === null) return;

        setResult(null);
        setTime(null);
        setProgressItems([]);
        setFeedback(null);
        setLoadingMessage('טוענת מודלים...');
        setStatus('loading');
        worker.current.postMessage({
            type: 'run', data: {audio, language, device, model}
        });
    }, [audio, device, language, model]);

    const handleClearModels = useCallback(() => {
        if (!worker.current || status !== 'ready') return;

        setFeedback(null);
        setProgressItems([]);
        setStatus('clearing');
        worker.current.postMessage({type: 'clear'});
    }, [status]);

    const handleModelChange = useCallback((model) => {
        setModel(model);
        setResult(null);
        setTime(null);
        setFeedback(null);
    }, []);

    return (
        <div dir="rtl" className="flex flex-col h-screen mx-auto text-gray-800 bg-white max-w-[600px]">

            {status === 'loading' && (
                <div className="flex justify-center items-center fixed w-screen h-screen bg-black z-20 bg-opacity-[92%] top-0 left-0">
                    <div className="w-[500px]">
                        <p className="text-center mb-1 text-white text-md">{loadingMessage}</p>
                        {progressItems.map(({file, progress, total}, i) => (
                            <Progress key={i} text={file} percentage={progress} total={total}/>
                        ))}
                    </div>
                </div>
            )}
            <div className="my-auto">
                <div className="flex flex-col items-center mb-2 text-center">
                    <div className="relative mb-2">
                        <h1 className="text-5xl font-bold">תמלולוטומטי</h1>
                        {status !== 'running' && (
                            <img
                                src="/lim-sleep.png"
                                alt=""
                                aria-hidden="true"
                                className="absolute right-0 top-0 w-120 translate-x-[50%] -translate-y-[60%] pointer-events-none select-none"
                            />
                        )}
                    </div>
                    <h2 className="text-xl font-semibold">זיהוי דיבור אוטומטי בדפדפן עם חותמות זמן ברמת מילה וזיהוי דוברים</h2>
                </div>

                <div className="w-full min-h-[220px] flex flex-col justify-center items-center">
                    <div className="flex flex-col w-full m-3 max-w-[520px]">
                        <div className="grid grid-cols-2 gap-3 mb-3">
                            <label className="flex flex-col">
                                <span className="text-sm mb-0.5">שפה</span>
                                <LanguageSelector className="border rounded-lg p-1" language={language} setLanguage={setLanguage}/>
                            </label>
                            <label className="flex flex-col">
                                <span className="text-sm mb-0.5">מודל</span>
                                <ModelSelector className="border rounded-lg p-1" model={model} setModel={handleModelChange}/>
                            </label>
                        </div>
                        <span className="text-sm mb-0.5">קובץ שמע/וידאו</span>
                        <MediaInput
                            ref={mediaInputRef}
                            isRunning={status === 'running'}
                            className="flex items-center border rounded-md cursor-pointer min-h-[100px] max-h-[500px] overflow-hidden"
                            onInputChange={(audio) => {
                                setResult(null);
                                setFeedback(null);
                                setAudio(audio);
                            }}
                            onTimeUpdate={(time) => setCurrentTime(time)}
                        />
                    </div>

                    <div className="w-full flex justify-center items-center">
                        <button
                            className="border px-4 py-2 rounded-lg bg-orange-400 text-white hover:bg-orange-500 disabled:cursor-not-allowed select-none"
                            onClick={handleClick}
                            disabled={status === 'running'}
                        >
                            {status === 'running' ? 'מעבדת...' : result ? 'הרצה שוב' : 'הרצת מודל'}
                        </button>
                    </div>
                    <div className="fixed bottom-4 right-4 z-10">
                        <button
                            className="border px-4 py-2 rounded-lg bg-white text-gray-700 hover:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed select-none"
                            onClick={handleClearModels}
                            disabled={status !== 'ready'}
                        >
                            {status === 'clearing' ? 'מוחקת...' : 'ניקוי אחסון מודלים'}
                        </button>
                    </div>
                    {feedback && (
                        <p className={`text-sm text-center mt-2 ${feedback.type === 'error' ? 'text-red-700' : 'text-gray-600'}`}>
                            {feedback.text}
                        </p>
                    )}

                    {
                        result && time && (
                            <>
                                <div className="w-full mt-4 border rounded-md">
                                    <Transcript
                                        className="p-2 max-h-[200px] overflow-y-auto scrollbar-thin select-none"
                                        transcript={result.transcript}
                                        segments={result.segments}
                                        currentTime={currentTime}
                                        setCurrentTime={(time) => {
                                            setCurrentTime(time);
                                            mediaInputRef.current.setMediaTime(time);
                                        }}
                                    />
                                </div>
                                <p className="text-sm text-gray-600 text-end p-1">זמן עיבוד: <span className="text-gray-800 font-semibold">{(time / 1000).toFixed(2)} שניות</span></p>
                            </>
                        )
                    }
                </div>
            </div>
            <a
                href="https://github.com/ReallyLiri/web-whisper-speaker-diarization"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-400 hover:text-gray-600 text-center py-2"
            >קוד מקור</a>
        </div>
    )
}

export default App
