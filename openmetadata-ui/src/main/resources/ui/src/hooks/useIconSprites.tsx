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
import { useEffect, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReactComponent as FunctionIcon } from '../assets/svg/ic-function.svg';
import { ReactComponent as PipelineIcon } from '../assets/svg/pipeline-grey.svg';

export interface IconSprites {
  pipeline: HTMLImageElement;
  pipelineGreen: HTMLImageElement;
  pipelineAmber: HTMLImageElement;
  pipelineRed: HTMLImageElement;
  function: HTMLImageElement;
}

async function svgToImage(
  SvgComponent: React.FC<React.SVGProps<SVGSVGElement>>,
  width: number,
  height: number,
  color?: string
): Promise<HTMLImageElement> {
  const svgString = renderToStaticMarkup(
    <SvgComponent style={{ color, width, height }} />
  );

  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  const img = new Image(width, height);

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = url;
  });

  URL.revokeObjectURL(url);

  return img;
}

export function useIconSprites(): IconSprites | null {
  const [sprites, setSprites] = useState<IconSprites | null>(null);

  useEffect(() => {
    const loadSprites = async () => {
      try {
        const [
          pipeline,
          pipelineGreen,
          pipelineAmber,
          pipelineRed,
          functionIcon,
        ] = await Promise.all([
          svgToImage(PipelineIcon, 16, 16),
          svgToImage(PipelineIcon, 16, 16, '#52C41A'),
          svgToImage(PipelineIcon, 16, 16, '#FAAD14'),
          svgToImage(PipelineIcon, 16, 16, '#F5222D'),
          svgToImage(FunctionIcon, 16, 16),
        ]);

        setSprites({
          pipeline,
          pipelineGreen,
          pipelineAmber,
          pipelineRed,
          function: functionIcon,
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to load icon sprites:', error);
      }
    };

    loadSprites();
  }, []);

  return sprites;
}
