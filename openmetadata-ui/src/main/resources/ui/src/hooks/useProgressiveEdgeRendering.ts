/*
 *  Copyright 2026 Collate.
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Edge } from 'reactflow';

const BATCH_SIZE = 500;
const BATCH_DELAY = 50;

interface UseProgressiveEdgeRenderingOptions {
  onBatchComplete?: (batch: number, total: number) => void;
  onComplete?: () => void;
}

export const useProgressiveEdgeRendering = (
  options?: UseProgressiveEdgeRenderingOptions
) => {
  const [renderedEdges, setRenderedEdges] = useState<Edge[]>([]);
  const [isRendering, setIsRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const renderQueueRef = useRef<Edge[]>([]);
  const animationFrameRef = useRef<number>();
  const timeoutRef = useRef<NodeJS.Timeout>();

  const processBatch = useCallback(() => {
    if (renderQueueRef.current.length === 0) {
      setIsRendering(false);
      setProgress(100);
      options?.onComplete?.();

      return;
    }

    const batch = renderQueueRef.current.splice(0, BATCH_SIZE);
    const totalEdges =
      batch.length + renderQueueRef.current.length + renderedEdges.length;
    const currentProgress = Math.round(
      ((renderedEdges.length + batch.length) / totalEdges) * 100
    );

    animationFrameRef.current = requestAnimationFrame(() => {
      setRenderedEdges((prev) => [...prev, ...batch]);
      setProgress(currentProgress);
      options?.onBatchComplete?.(
        renderedEdges.length + batch.length,
        totalEdges
      );

      timeoutRef.current = setTimeout(processBatch, BATCH_DELAY);
    });
  }, [renderedEdges.length, options]);

  const startRendering = useCallback(
    (edges: Edge[]) => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      renderQueueRef.current = [...edges];
      setRenderedEdges([]);
      setIsRendering(true);
      setProgress(0);

      processBatch();
    },
    [processBatch]
  );

  const cancelRendering = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    renderQueueRef.current = [];
    setIsRendering(false);
  }, []);

  useEffect(() => {
    return () => {
      cancelRendering();
    };
  }, [cancelRendering]);

  return {
    renderedEdges,
    isRendering,
    progress,
    startRendering,
    cancelRendering,
  };
};
