import type { Dataset, SemanticModel, SystemConfig } from './types';
import { SemanticLoader } from './loader';

export class SemanticRegistry {
    private datasets: Map<string, Dataset> = new Map();
    private models: Map<string, SemanticModel> = new Map();
    private config: SystemConfig = {};
    private loader: SemanticLoader;
    private initialized = false;

    constructor(loader?: SemanticLoader) {
        this.loader = loader || new SemanticLoader();
    }

    async init(config?: { baseUrl?: string }) {
        if (this.initialized) return;

        if (config?.baseUrl) {
            this.loader = new SemanticLoader(config.baseUrl);
        }

        // Load Manifest
        const manifest = await this.loader.loadManifest();

        // Load Config
        this.config = await this.loader.loadConfig();

        // Load Datasets
        const datasetPaths = manifest.datasets.map(d => d.path);
        const loadedDatasets = await this.loader.loadDatasets(datasetPaths);
        loadedDatasets.forEach(d => this.datasets.set(d.name, d));

        // Load Models
        const modelPaths = manifest.semantic_models.map(m => m.path);
        const loadedModels = await this.loader.loadSemanticModels(modelPaths);
        loadedModels.forEach(m => this.models.set(m.name, m));

        this.initialized = true;

    }

    // ... (rest of methods)

    getConfig(): SystemConfig {
        return this.config;
    }

    getDataset(name: string): Dataset | undefined {
        return this.datasets.get(name);
    }

    getModel(name: string): SemanticModel | undefined {
        return this.models.get(name);
    }

    getAllModels(): SemanticModel[] {
        return Array.from(this.models.values());
    }

    listModels(): SemanticModel[] {
        return this.getAllModels();
    }

    listDatasets(): Dataset[] {
        return Array.from(this.datasets.values());
    }



    getDimension(modelName: string, dimName: string) {
        const model = this.getModel(modelName);
        if (!model) return null;
        return model.dimensions.find(d => d.name === dimName);
    }

    getMeasure(modelName: string, measName: string) {
        const model = this.getModel(modelName);
        if (!model) return null;
        return model.measures.find(m => m.name === measName);
    }
}

// Singleton instance for the app
export const registry = new SemanticRegistry();
