import { useEffect, useRef } from 'react';
import * as comlink from 'comlink';
import type { WorkerAPI } from '../types/pdf';

export function useWorker() {
  const workerRef = useRef<Worker | null>(null);
  const apiRef = useRef<comlink.Remote<WorkerAPI> | null>(null);

  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../workers/pdf.worker.ts', import.meta.url),
      { type: 'module' }
    );
    apiRef.current = comlink.wrap<WorkerAPI>(workerRef.current);

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  return apiRef;
}