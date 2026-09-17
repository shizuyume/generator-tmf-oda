import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Generic debounced-search state for an Autocomplete lookup field.
 * Loads an initial empty-query result on mount, then re-searches (debounced)
 * as the user types.
 */
export function useDebouncedSearch<T>(searchFn: (query: string) => Promise<T[]>, delayMs = 300) {
  const [options, setOptions] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((query: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setLoading(true);
      searchFn(query)
        .then(setOptions)
        .catch(() => setOptions([]))
        .finally(() => setLoading(false));
    }, delayMs);
  }, [searchFn, delayMs]);

  useEffect(() => {
    search('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { options, loading, search };
}
