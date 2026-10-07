import { useCallback, useEffect, useRef, useState } from 'react';
import type { LookupOption } from '../service/lookupService';
import type { LookupFn } from './types';

export interface LookupState {
  options: LookupOption[];
  loading: boolean;
  /** The lookup failed (service unconfigured / unavailable): its friendly message. */
  error: string | null;
}

const IDLE: LookupState = { options: [], loading: false, error: null };

/**
 * State of every relation lookup a form uses, keyed like `config.lookups`.
 * All load once on mount (after `delayMs`, as a debounced empty search); `retryFailed`
 * reloads the ones that failed — the form calls it on every open.
 * This is the first page every picker shows before anything is typed; typed searches go
 * to the lookup from the picker itself (components/form/LookupPicker).
 */
export function useLookups(lookups: Record<string, LookupFn>, delayMs = 300) {
  const [state, setState] = useState<Record<string, LookupState>>({});
  const stateRef = useRef(state);
  stateRef.current = state;

  const run = useCallback((key: string) => {
    setState((s) => ({ ...s, [key]: { ...(s[key] ?? IDLE), loading: true } }));
    lookups[key]('')
      .then((options) => setState((s) => ({ ...s, [key]: { options, loading: false, error: null } })))
      .catch((err: unknown) => setState((s) => ({
        ...s,
        [key]: { options: [], loading: false, error: err instanceof Error ? err.message : 'Options could not be loaded.' },
      })));
  }, [lookups]);

  useEffect(() => {
    const timer = setTimeout(() => Object.keys(lookups).forEach(run), delayMs);
    return () => clearTimeout(timer);
  }, [lookups, run, delayMs]);

  const retryFailed = useCallback(() => {
    Object.entries(stateRef.current).forEach(([key, s]) => { if (s.error) run(key); });
  }, [run]);

  const get = (key: string): LookupState => state[key] ?? IDLE;
  return { get, retryFailed };
}
