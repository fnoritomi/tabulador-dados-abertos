import { useState, useEffect } from 'react';
import { registry } from '../semantic/registry';

// Hardcoded manifest removed in favor of dynamic loader

export function useSemanticLayer() {
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        const init = async () => {
            try {
                const baseUrl = import.meta.env.BASE_URL
                    ? `${import.meta.env.BASE_URL}metadata`
                    : '/metadata';

                // Normalizes double slashes if BASE_URL ends with /
                const finalUrl = baseUrl.replace('//metadata', '/metadata');

                await registry.init({ baseUrl: finalUrl });
                setIsReady(true);
            } catch (e: any) {
                console.error("Failed to init semantic layer", e);
                setError(e);
            }
        };

        init();
    }, []);

    return {
        registry,
        isReady,
        error
    };
}
