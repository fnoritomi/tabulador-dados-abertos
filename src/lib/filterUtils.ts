
export const getFriendlyOperatorLabel = (operator: string, colType?: string): string => {
    if (colType === 'date' || colType === 'timestamp' || colType === 'time') {
        switch (operator) {
            case '=': return 'em'; // em 2022
            case '!=': return 'não está em';
            case '>': return 'após';
            case '<': return 'antes de';
            case '>=': return 'a partir de';
            case '<=': return 'até';
            default: return operator;
        }
    }
    return operator;
};

export const formatFilterValue = (value: string, granularity?: string): string => {
    if (!value) return '';
    if (!granularity || granularity === 'day') return value;

    const parts = value.split('-');
    const year = parts[0];

    if (granularity === 'year') {
        return year;
    }

    if (granularity === 'quarter') {
        // Expected value: YYYY-MM where MM is 01, 04, 07, 10
        if (parts.length >= 2) {
            const month = parseInt(parts[1], 10);
            const quarter = Math.ceil(month / 3);
            return `Q${quarter} ${year}`;
        }
    }

    if (granularity === 'month') {
        if (parts.length >= 2) {
            return `${parts[1]}/${year}`;
        }
    }

    return value;
};
