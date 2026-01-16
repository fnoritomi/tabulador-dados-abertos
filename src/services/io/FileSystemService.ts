
export interface FileWriter {
    write(data: Uint8Array): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
}

export class FileSystemService {
    private fallbackLimit: number;

    constructor(fallbackLimitBytes: number = 100 * 1024 * 1024) {
        this.fallbackLimit = fallbackLimitBytes;
    }

    async createWriter(suggestedName: string, onStatus?: (msg: string) => void): Promise<FileWriter> {
        // 1. Try Native File System Access API
        try {
            // Try Native File System Access API
            if (typeof (window as any).showSaveFilePicker === 'function') {
                const fileHandle = await (window as any).showSaveFilePicker({
                    suggestedName: suggestedName,
                    types: [{
                        description: 'Comma Separated Values',
                        accept: { 'text/csv': ['.csv'] },
                    }],
                });
                const writable = await fileHandle.createWritable();
                return new NativeFileWriter(writable);
            }
        } catch (err: unknown) {
            const error = err as Error;
            if (error.name === 'AbortError') {
                throw new Error("Exportação cancelada pelo usuário.");
            }
            console.warn('File System Access API error or unsupported, using fallback', err);
        }

        // 2. Use Fallback Pattern
        return new FallbackFileWriter(suggestedName, this.fallbackLimit, onStatus);
    }
}

class NativeFileWriter implements FileWriter {
    private writable: any;

    constructor(writable: any) {
        this.writable = writable;
    }

    async write(data: Uint8Array): Promise<void> {
        await this.writable.write(data);
    }

    async close(): Promise<void> {
        await this.writable.close();
    }

    async abort(): Promise<void> {
        try {
            await this.writable.abort();
        } catch { /* ignore */ }
    }
}

class FallbackFileWriter implements FileWriter {
    private buffer: Uint8Array[] = [];
    private currentSize: number = 0;
    private partIndex: number = 1;
    private baseName: string;
    private limitByes: number;
    private onStatus?: (msg: string) => void;

    constructor(baseName: string, limitByes: number, onStatus?: (msg: string) => void) {
        // Strip extension for parts naming
        this.baseName = baseName.replace(/\.csv$/i, '');
        this.limitByes = limitByes;
        this.onStatus = onStatus;
    }

    async write(data: Uint8Array): Promise<void> {
        this.buffer.push(data);
        this.currentSize += data.byteLength;

        if (this.currentSize >= this.limitByes) {
            await this.flushPart(false);
        }
    }

    async close(): Promise<void> {
        if (this.buffer.length > 0) {
            await this.flushPart(true);
        }
    }

    async abort(): Promise<void> {
        this.buffer = [];
        this.currentSize = 0;
    }

    private async flushPart(isFinal: boolean): Promise<void> {
        if (this.buffer.length === 0) return;

        const partNum = this.partIndex;
        if (!isFinal) {
            this.onStatus?.(`Baixando parte ${partNum}...`);
        } else {
            this.onStatus?.(`Baixando parte final...`);
        }

        const blob = new Blob(this.buffer as any, { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');

        let fileName = `${this.baseName}.csv`;
        if (partNum > 1 || !isFinal) {
            fileName = `${this.baseName}_part${partNum}.csv`;
        }

        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Reset buffer
        this.buffer = [];
        this.currentSize = 0;
        this.partIndex++;

        // Give browser time to process download start
        await new Promise(resolve => setTimeout(resolve, 500));
        URL.revokeObjectURL(url);
    }
}
