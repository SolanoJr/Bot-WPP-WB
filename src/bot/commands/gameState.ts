/**
 * Estado em memória dos jogos (forca e velha).
 * Não persiste entre reinícios do bot – suficiente para demonstração.
 */

// Estado da forca por chatId
export const forcaState: Map<string, {
    word: string;
    guessed: Set<string>;
    attemptsLeft: number;
}> = new Map();

// Estado da velha por chatId
export const velhaState: Map<string, {
    board: string[]; // 9 posições, '' = vazio, 'X' ou 'O'
    currentPlayer: 'X' | 'O';
}> = new Map();
