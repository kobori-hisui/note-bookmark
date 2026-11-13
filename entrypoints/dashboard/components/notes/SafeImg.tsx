import { useState, type ImgHTMLAttributes } from 'react';

/** <img> que, si falla (sin internet, el sitio la borró), muestra un recuadro en vez de un ícono roto. */
export function SafeImg({ src, className, ...rest }: ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className={`img-fail ${className ?? ''}`}>🖼 no disponible</div>;
  return (
    <img
      src={src}
      className={className}
      loading="lazy"
      referrerPolicy="no-referrer"
      alt=""
      onError={() => setFailed(true)}
      {...rest}
    />
  );
}
