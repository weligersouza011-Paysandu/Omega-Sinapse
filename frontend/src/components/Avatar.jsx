import { useState } from 'react';

/** Até duas iniciais do nome. */
export function iniciaisDe(nome) {
  return (nome || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join('');
}

const TAMANHOS = {
  sm: 'h-9 w-9 text-xs',
  lg: 'h-28 w-28 text-3xl',
};

/** Foto do usuário (ou as iniciais, se não houver foto ou ela não carregar). */
export default function Avatar({ nome, foto, tamanho = 'sm', className = '' }) {
  const [falhou, setFalhou] = useState(false);
  const classes = `${TAMANHOS[tamanho] || TAMANHOS.sm} shrink-0 overflow-hidden rounded-full ${className}`;

  if (foto && !falhou) {
    return <img src={foto} alt={nome ? `Foto de ${nome}` : 'Foto do usuário'} className={`${classes} object-cover`} onError={() => setFalhou(true)} />;
  }
  return (
    <span className={`${classes} flex items-center justify-center bg-omega-600 font-bold text-white`} aria-hidden="true">
      {iniciaisDe(nome) || '?'}
    </span>
  );
}
