/**
 * Parser de argumentos de comando que RESPEITA aspas.
 * Divide por espaços em branco, mas mantém texto entre "..." ou '...' como
 * um único argumento. Ex: `$votar 1 "vamos sim" sim 60` -> ['1','vamos sim','sim','60'].
 * Substitui o `.split(/ +/)` ingênuo que quebrava comandos com espaço no meio.
 */
export function splitArgs(text: string): string[] {
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]!);
  }
  return out;
}
