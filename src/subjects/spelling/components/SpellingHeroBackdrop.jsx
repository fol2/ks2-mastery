import React from 'react';
import { heroBgStyle, heroPanDelayStyle } from './spelling-view-model.js';

export function SpellingHeroBackdrop({ url }) {
  const layerId = React.useRef(0);
  const [layers, setLayers] = React.useState(() => (
    url ? [{ id: 0, url }] : []
  ));

  React.useEffect(() => {
    if (!url) {
      setLayers([]);
      return undefined;
    }

    setLayers((current) => {
      const latest = current[current.length - 1];
      if (latest?.url === url) return current;
      layerId.current += 1;
      return [...current.slice(-1), { id: layerId.current, url }];
    });

    const timer = setTimeout(() => {
      setLayers((current) => current.slice(-1));
    }, 780);

    return () => clearTimeout(timer);
  }, [url]);

  if (!layers.length) return null;

  const panStyle = heroPanDelayStyle();
  const activeLayerId = layers[layers.length - 1]?.id;

  return (
    <div className="spelling-hero-backdrop" aria-hidden="true">
      {layers.map((layer) => (
        <div
          className={`hero-art pan spelling-hero-layer${layer.id === activeLayerId ? ' is-active' : ' is-exiting'}`}
          style={{ ...heroBgStyle(layer.url), ...panStyle }}
          key={layer.id}
        />
      ))}
    </div>
  );
}
