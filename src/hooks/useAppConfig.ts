import { useState, useEffect } from 'react';
import { setConfig, DEFAULT_CONFIG, type AppFormattingConfig } from '../lib/formatting';
import type { SemanticRegistry } from '../semantic/registry';

export function useAppConfig(
    registry: SemanticRegistry | undefined,
    semanticReady: boolean,
    uiLocale: string
) {
    const [loadedConfig, setLoadedConfig] = useState<AppFormattingConfig | null>(null);

    // Load Config from Semantic Registry
    useEffect(() => {
        if (!semanticReady || !registry) return;

        const systemConfig = registry.getConfig();
        const defaults = systemConfig.defaults || {};
        const overrides = systemConfig.overrides || {};

        // 1. Resolve Locale Config
        const localeCode = uiLocale === 'system' ? navigator.language : uiLocale;
        let localeConfig = null;
        if (systemConfig.locales) {
            localeConfig = systemConfig.locales.find((l: any) => l.code === localeCode)
                || systemConfig.locales.find((l: any) => l.code.split('-')[0] === localeCode.split('-')[0])
                || systemConfig.locales[0];
        }

        // 2. Base Configuration (Global Defaults + Locale)
        const baseConfig: AppFormattingConfig = {
            locale: localeConfig ? localeConfig.code : (defaults.locale || 'pt-BR'),
            currency: localeConfig?.currency || (defaults.number_format?.currency || 'BRL'),
            csv: (localeConfig?.csv as any) || { separator: ';', encoding: 'UTF-8' as const },
            defaults: {
                date: {
                    pattern: defaults.date_format?.pattern
                },
                timestamp: {
                    pattern: defaults.date_format?.time_pattern // Map time_pattern to timestamp.pattern
                },
                number: {
                    ...defaults.number_format
                }
            }
        };

        // 3. Apply Overrides (Mandatory)
        if (overrides.date_format?.pattern) {
            if (!baseConfig.defaults!.date) baseConfig.defaults!.date = {};
            baseConfig.defaults!.date!.pattern = overrides.date_format.pattern;
        }
        if (overrides.date_format?.time_pattern) {
            if (!baseConfig.defaults!.timestamp) baseConfig.defaults!.timestamp = {};
            baseConfig.defaults!.timestamp!.pattern = overrides.date_format.time_pattern;
        }
        if (overrides.number_format) {
            baseConfig.defaults!.number = {
                ...baseConfig.defaults!.number,
                ...overrides.number_format
            };
        }

        setLoadedConfig(baseConfig);

    }, [semanticReady, registry, uiLocale]);

    // Update Config when UI Locale changes
    useEffect(() => {
        if (!loadedConfig) return; // Wait for load

        // Priority: UI (if not system) > Config > Browser
        const newLocale = uiLocale === 'system'
            ? (loadedConfig.locale || navigator.language)
            : uiLocale;

        setConfig({
            ...loadedConfig,
            locale: newLocale
        });
    }, [uiLocale, loadedConfig]);

    // Calculate Effective Config
    const currentLocale = uiLocale === 'system' ? (loadedConfig?.locale || navigator.language) : uiLocale;

    // Find locale definition in registry
    const localeDef = loadedConfig?.locales?.find((l: any) =>
        l.code === currentLocale ||
        (currentLocale.includes('-') && l.code === currentLocale) || // exact match
        l.code.startsWith(currentLocale.split('-')[0]) // lazy match pt-BR matches pt
    );

    const effectiveConfig: AppFormattingConfig = {
        ...DEFAULT_CONFIG,
        ...(loadedConfig || {}), // Global overrides
        ...(localeDef || {}),    // Locale-specific overrides (currency, csv)
        locale: currentLocale    // Ensure effective locale is current
    };

    return { loadedConfig, effectiveConfig };
}
