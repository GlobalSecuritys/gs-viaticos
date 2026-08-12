export function formatApiError(err, fallback = 'Ha ocurrido un error') {
    const detail = err.response?.data?.detail;
    if (!detail) return fallback;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
        return detail
            .map((item) => {
                if (typeof item === 'string') return item;
                if (item?.msg) return item.msg.replace(/^Value error,\s*/, '');
                return JSON.stringify(item);
            })
            .join('. ');
    }
    if (typeof detail === 'object') {
        if (detail.msg) return detail.msg.replace(/^Value error,\s*/, '');
        return JSON.stringify(detail);
    }
    return fallback;
}
