import yaml from 'js-yaml';
import {
    SystemConfigSchema,
    DatasetsFileSchema,
    SemanticModelsFileSchema,
    MetadataManifestSchema
} from './schema';
import type { SystemConfig, Dataset, SemanticModel, MetadataManifest } from './types';

export class SemanticLoader {
    private baseUrl: string;

    constructor(baseUrl: string = '/metadata') {
        this.baseUrl = baseUrl;
    }

    async loadManifest(): Promise<MetadataManifest> {
        try {
            const text = await this.fetchText(`${this.baseUrl}/manifest.yaml`);
            const data = yaml.load(text);
            return MetadataManifestSchema.parse(data) as MetadataManifest;
        } catch (e) {
            console.error("Failed to load manifest.yaml", e);
            return { datasets: [], semantic_models: [] };
        }
    }

    async loadConfig(): Promise<SystemConfig> {
        try {
            const text = await this.fetchText(`${this.baseUrl}/config.yaml`);
            const data = yaml.load(text);
            return SystemConfigSchema.parse(data) as SystemConfig;
        } catch (e) {
            console.warn("Could not load config.yaml, using built-in defaults", e);
            return {};
        }
    }

    async loadDatasets(files: string[]): Promise<Dataset[]> {
        const datasets: Dataset[] = [];
        const appBaseUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const fullBase = `${origin}${appBaseUrl}`;

        for (const file of files) {
            try {
                // Ensure no double slash if file paths in manifest already have metadata relative
                const url = file.startsWith('/') ? file : `${this.baseUrl}/${file}`;
                const text = await this.fetchText(url);
                const data = yaml.load(text);
                const parsed = DatasetsFileSchema.parse(data);

                // Resolve Source URLs
                const resolvedDatasets = parsed.datasets.map(ds => ({
                    ...ds,
                    sources: ds.sources?.map(src => {
                        if (src.startsWith('http')) return src;
                        // If relative, assume relative to app root (public dir)
                        const cleanSrc = src.startsWith('/') ? src.slice(1) : src;
                        // data/foo.parquet -> http://localhost:5173/base/data/foo.parquet
                        return `${fullBase}${cleanSrc}`;
                    })
                }));

                datasets.push(...(resolvedDatasets as any[]));
            } catch (e) {
                console.error(`Failed to load dataset file ${file}`, e);
            }
        }
        return datasets;
    }

    async loadSemanticModels(files: string[]): Promise<SemanticModel[]> {
        const models: SemanticModel[] = [];
        for (const file of files) {
            try {
                const url = file.startsWith('/') ? file : `${this.baseUrl}/${file}`;
                const text = await this.fetchText(url);
                const data = yaml.load(text);
                const parsed = SemanticModelsFileSchema.parse(data);
                models.push(...(parsed.semantic_models as any[]));
            } catch (e) {
                console.error(`Failed to load model file ${file}`, e);
            }
        }
        return models;
    }

    protected async fetchText(url: string): Promise<string> {
        // Normalize URL to avoid double slashes (basic check)
        const cleanUrl = url.replace(/([^:]\/)\/+/g, "$1");
        const res = await fetch(cleanUrl);
        if (!res.ok) throw new Error(`Failed to fetch ${cleanUrl}: ${res.statusText}`);
        return res.text();
    }
}
