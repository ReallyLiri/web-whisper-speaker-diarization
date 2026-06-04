
import { pipeline, AutoProcessor, AutoModelForAudioFrameClassification, env } from '@huggingface/transformers';

const ASR_DEVICE_CONFIG = {
    webgpu: {
        base: {
            dtype: {
                encoder_model: 'fp32',
                decoder_model_merged: 'q4',
            },
            device: 'webgpu',
        },
        small: {
            dtype: {
                encoder_model: 'fp32',
                decoder_model_merged: 'q4',
            },
            device: 'webgpu',
        },
        medium: {
            dtype: {
                encoder_model: 'q4',
                decoder_model_merged: 'q4',
            },
            device: 'webgpu',
        },
    },
    wasm: {
        base: {
            dtype: 'q8',
            device: 'wasm',
        },
        small: {
            dtype: 'q8',
            device: 'wasm',
        },
        medium: {
            dtype: {
                encoder_model: 'q4',
                decoder_model_merged: 'q4',
            },
            device: 'wasm',
        },
    },
};

const ASR_MODELS = {
    base: 'onnx-community/whisper-base_timestamped',
    small: 'onnx-community/whisper-small_timestamped',
    medium: 'onnx-community/whisper-medium_timestamped',
};

const ASR_MODEL_LABELS = {
    base: 'Faster',
    small: 'Medium (but smarter)',
    medium: 'Slower (but smartest)',
};

function getAsrDeviceConfig(device, model) {
    return ASR_DEVICE_CONFIG[device]?.[model] ?? ASR_DEVICE_CONFIG.wasm.base;
}

/**
 * This class uses the Singleton pattern to ensure that only one instance of the model is loaded.
 */
class PipelineSingeton {
    static asr_model_id = null;
    static asr_instance = null;
    static asr_device = null;

    static segmentation_model_id = 'onnx-community/pyannote-segmentation-3.0';
    static segmentation_instance = null;
    static segmentation_processor = null;
    static warmed_up = false;

    static async getAsrInstance(progress_callback = null, device = 'webgpu', model = 'base') {
        const model_id = ASR_MODELS[model] ?? ASR_MODELS.base;

        if (this.asr_instance && (this.asr_model_id !== model_id || this.asr_device !== device)) {
            const previous_instance = await this.asr_instance;
            await previous_instance.dispose();
            this.asr_instance = null;
            this.asr_model_id = null;
            this.asr_device = null;
            this.warmed_up = false;
        }

        if (!this.asr_instance) {
            this.asr_model_id = model_id;
            this.asr_device = device;
            this.warmed_up = false;
            const asr_instance = pipeline('automatic-speech-recognition', model_id, {
                ...getAsrDeviceConfig(device, model),
                progress_callback,
            });
            this.asr_instance = asr_instance;
            asr_instance.catch(() => {
                if (this.asr_instance === asr_instance) {
                    this.asr_model_id = null;
                    this.asr_instance = null;
                    this.asr_device = null;
                    this.warmed_up = false;
                }
            });
        }

        return this.asr_instance;
    }

    static async getInstance(progress_callback = null, device = 'webgpu', model = 'base') {
        const asr_instance = this.getAsrInstance(progress_callback, device, model);

        if (!this.segmentation_processor) {
            const segmentation_processor = AutoProcessor.from_pretrained(this.segmentation_model_id, {
                progress_callback,
            });
            this.segmentation_processor = segmentation_processor;
            segmentation_processor.catch(() => {
                if (this.segmentation_processor === segmentation_processor) {
                    this.segmentation_processor = null;
                }
            });
        }

        if (!this.segmentation_instance) {
            const segmentation_instance = AutoModelForAudioFrameClassification.from_pretrained(this.segmentation_model_id, {
                // NOTE: WebGPU is not currently supported for this model
                // See https://github.com/microsoft/onnxruntime/issues/21386
                device: 'wasm',
                dtype: 'fp32',
                progress_callback,
            });
            this.segmentation_instance = segmentation_instance;
            segmentation_instance.catch(() => {
                if (this.segmentation_instance === segmentation_instance) {
                    this.segmentation_instance = null;
                }
            });
        }

        return Promise.all([asr_instance, this.segmentation_processor, this.segmentation_instance]);
    }

    static async dispose() {
        const [asr_result, segmentation_result] = await Promise.allSettled([
            this.asr_instance,
            this.segmentation_instance,
        ]);

        const disposals = [];
        if (asr_result.status === 'fulfilled' && asr_result.value?.dispose) {
            disposals.push(asr_result.value.dispose());
        }
        if (segmentation_result.status === 'fulfilled' && segmentation_result.value?.dispose) {
            disposals.push(segmentation_result.value.dispose());
        }

        await Promise.allSettled(disposals);

        this.asr_model_id = null;
        this.asr_instance = null;
        this.asr_device = null;
        this.segmentation_instance = null;
        this.segmentation_processor = null;
        this.warmed_up = false;
    }
}

async function loadModels({ device, model }) {
    const model_key = ASR_MODELS[model] ? model : 'base';
    const model_id = ASR_MODELS[model_key];
    const should_load_asr = PipelineSingeton.asr_model_id !== model_id || PipelineSingeton.asr_device !== device || !PipelineSingeton.asr_instance;
    const should_load_segmentation = !PipelineSingeton.segmentation_processor || !PipelineSingeton.segmentation_instance;

    if (should_load_asr || should_load_segmentation) {
        self.postMessage({
            status: 'loading',
            data: `Loading ${ASR_MODEL_LABELS[model_key]} model (${device})...`
        });
    }

    const [transcriber, segmentation_processor, segmentation_model] = await PipelineSingeton.getInstance(x => {
        self.postMessage(x);
    }, device, model_key);

    if (device === 'webgpu' && !PipelineSingeton.warmed_up) {
        self.postMessage({
            status: 'loading',
            data: 'Compiling shaders and warming up model...'
        });

        await transcriber(new Float32Array(16_000), {
            language: 'en',
        });
        PipelineSingeton.warmed_up = true;
    }

    return [transcriber, segmentation_processor, segmentation_model];
}

async function segment(processor, model, audio) {
    const inputs = await processor(audio);
    const { logits } = await model(inputs);
    const segments = processor.post_process_speaker_diarization(logits, audio.length)[0];

    // Attach labels
    for (const segment of segments) {
        segment.label = model.config.id2label[segment.id];
    }

    return segments;
}

async function run({ audio, language, device, model }) {
    const [transcriber, segmentation_processor, segmentation_model] = await loadModels({ device, model });
    self.postMessage({ status: 'running' });

    const start = performance.now();

    // Run transcription and segmentation in parallel
    const [transcript, segments] = await Promise.all([
        transcriber(audio, {
            language,
            return_timestamps: 'word',
            chunk_length_s: 30,
        }),
        segment(segmentation_processor, segmentation_model, audio)
    ]);
    console.table(segments, ['start', 'end', 'id', 'label', 'confidence']);

    const end = performance.now();

    self.postMessage({ status: 'complete', result: { transcript, segments }, time: end - start });
}

async function clearModels() {
    await PipelineSingeton.dispose();

    const cacheDeleted = typeof caches !== 'undefined'
        ? await caches.delete(env.cacheKey)
        : false;

    self.postMessage({ status: 'cleared', cacheDeleted });
}

function reportError(error) {
    const message = error instanceof Error ? error.message : error ? String(error) : 'Unknown worker error.';

    self.postMessage({
        status: 'error',
        error: message,
        stack: error instanceof Error ? error.stack : null,
    });
}

async function handleRun(data) {
    try {
        await run(data);
    } catch (error) {
        try {
            await PipelineSingeton.dispose();
        } finally {
            reportError(error);
        }
    }
}

async function handleClear() {
    try {
        await clearModels();
    } catch (error) {
        reportError(error);
    }
}

self.addEventListener('unhandledrejection', (event) => {
    event.preventDefault();
    PipelineSingeton.dispose().finally(() => {
        reportError(event.reason);
    });
});

self.addEventListener('error', (event) => {
    event.preventDefault();
    PipelineSingeton.dispose().finally(() => {
        reportError(event.error ?? event.message);
    });
});

// Listen for messages from the main thread
self.addEventListener('message', async (e) => {
    const { type, data } = e.data;

    switch (type) {
        case 'run':
            handleRun(data);
            break;

        case 'clear':
            handleClear();
            break;
    }
});
