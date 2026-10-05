/**
 * aleatorioService — aleatório simples com porcentagem de acerto.
 */
export function getAleatorio(msg: string = ''): { result: string; percent: number } {
  const opts = ['sim', 'não', 'talvez', 'provavelmente', 'improvavelmente', 'não sei'];
  const idx = Math.floor(Math.random() * opts.length);
  const percent = Math.round(Math.random() * 100);
  return { result: opts[idx], percent };
}
