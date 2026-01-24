export interface AudioChunk {
  data: ArrayBuffer;
  timestamp: number;
  sampleRate: number;
}

export class AudioEncoder {
  private audioContext: AudioContext | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private onChunk: ((chunk: AudioChunk) => void) | null = null;

  async start(stream: MediaStream, onChunk: (chunk: AudioChunk) => void): Promise<void> {
    this.onChunk = onChunk;
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    this.mediaStreamSource = this.audioContext.createMediaStreamSource(stream);
    
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    
    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const int16Data = new Int16Array(inputData.length);
      
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      
      if (this.onChunk) {
        this.onChunk({
          data: int16Data.buffer,
          timestamp: Date.now(),
          sampleRate: this.audioContext?.sampleRate || 16000,
        });
      }
    };

    this.mediaStreamSource.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  stop(): void {
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.onChunk = null;
  }
}

export class AudioDecoder {
  private audioContext: AudioContext | null = null;
  private nextPlayTime: number = 0;

  async start(): Promise<void> {
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    this.nextPlayTime = this.audioContext.currentTime;
  }

  playChunk(chunk: AudioChunk): void {
    if (!this.audioContext) return;

    const int16Data = new Int16Array(chunk.data);
    const floatData = new Float32Array(int16Data.length);
    
    for (let i = 0; i < int16Data.length; i++) {
      floatData[i] = int16Data[i] / 0x7FFF;
    }

    const audioBuffer = this.audioContext.createBuffer(1, floatData.length, chunk.sampleRate);
    audioBuffer.getChannelData(0).set(floatData);

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    const now = this.audioContext.currentTime;
    if (this.nextPlayTime < now) {
      this.nextPlayTime = now;
    }
    
    source.start(this.nextPlayTime);
    this.nextPlayTime += audioBuffer.duration;
  }

  stop(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.nextPlayTime = 0;
  }
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
