export interface AudioChunk {
  data: ArrayBuffer;
  timestamp: number;
  sampleRate: number;
}

export class AudioEncoder {
  private context: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private onChunk: (chunk: AudioChunk) => void = () => {};

  async start(stream: MediaStream, onChunk: (chunk: AudioChunk) => void) {
    this.onChunk = onChunk;
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 16000
    });

    this.source = this.context.createMediaStreamSource(stream);
    this.processor = this.context.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const pcmData = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      this.onChunk({
        data: pcmData.buffer,
        timestamp: Date.now(),
        sampleRate: 16000
      });
    };

    this.source.connect(this.processor);
    this.processor.connect(this.context.destination);
  }

  stop() {
    this.source?.disconnect();
    this.processor?.disconnect();
    if (this.context?.state !== 'closed') {
      this.context?.close();
    }
  }
}

export class AudioDecoder {
  private context: AudioContext | null = null;
  private startTime: number = 0;

  async start() {
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 16000
    });
    this.startTime = this.context.currentTime;
  }

  playChunk(chunk: AudioChunk) {
    if (!this.context) return;

    const pcmData = new Int16Array(chunk.data);
    const floatData = new Float32Array(pcmData.length);
    
    for (let i = 0; i < pcmData.length; i++) {
      floatData[i] = pcmData[i] / (pcmData[i] < 0 ? 0x8000 : 0x7FFF);
    }

    const audioBuffer = this.context.createBuffer(1, floatData.length, 16000);
    audioBuffer.getChannelData(0).set(floatData);

    const source = this.context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.context.destination);

    const currentTime = this.context.currentTime;
    if (this.startTime < currentTime) {
      this.startTime = currentTime + 0.1;
    }
    
    source.start(this.startTime);
    this.startTime += audioBuffer.duration;
  }

  stop() {
    if (this.context?.state !== 'closed') {
      this.context?.close();
    }
    this.context = null;
  }
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
