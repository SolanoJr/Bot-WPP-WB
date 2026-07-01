import { ICommand } from './types';
import { velhaState } from './gameState';

function renderBoard(board: string[]): string {
  return `
 ${board[0] || '1'} | ${board[1] || '2'} | ${board[2] || '3'}
---+---+---
 ${board[3] || '4'} | ${board[4] || '5'} | ${board[5] || '6'}
---+---+---
 ${board[6] || '7'} | ${board[7] || '8'} | ${board[8] || '9'}
`;
}

function checkWinner(board: string[]): 'X' | 'O' | 'draw' | null {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // linhas
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // colunas
    [0, 4, 8], [2, 4, 6]             // diagonais
  ];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a] as 'X' | 'O';
    }
  }
  if (board.every(cell => cell !== '')) return 'draw';
  return null;
}

export const velhaCommand: ICommand = {
  name: 'velha',
  description: 'Jogo da velha. Use "$velha" para iniciar, "$velha <1-9>" para jogar, "$velha reset" para reiniciar.',
  async execute(msg, client, args) {
    const chatId = msg.from || msg.author || 'unknown';
    
    // Inicializa estado se ainda não existir
    if (!velhaState.has(chatId) || args[0]?.toLowerCase() === 'reset') {
      velhaState.set(chatId, {
        board: Array(9).fill(''),
        currentPlayer: 'X'
      });
      await msg.reply(`🕹️ Jogo da Velha iniciado!\n${renderBoard(Array(9).fill(''))}\nVez do jogador: X\nDigite um número de 1 a 9 para jogar.`);
      return;
    }

    const state = velhaState.get(chatId)!;
    const move = args[0];

    if (!move || !/^[1-9]$/.test(move)) {
      await msg.reply(`⚠️ Use um número de 1 a 9 ou "reset" para reiniciar.\n${renderBoard(state.board)}\nVez do jogador: ${state.currentPlayer}`);
      return;
    }

    const idx = parseInt(move, 10) - 1;
    if (state.board[idx] !== '') {
      await msg.reply(`⚠️ Posição ${move} já ocupada!\n${renderBoard(state.board)}\nVez do jogador: ${state.currentPlayer}`);
      return;
    }

    state.board[idx] = state.currentPlayer;
    const winner = checkWinner(state.board);

    if (winner === 'X' || winner === 'O') {
      velhaState.delete(chatId);
      await msg.reply(`🎉 Jogador ${winner} venceu!\n${renderBoard(state.board)}`);
      return;
    }

    if (winner === 'draw') {
      velhaState.delete(chatId);
      await msg.reply(`🤝 Empate!\n${renderBoard(state.board)}`);
      return;
    }

    // Troca jogador
    state.currentPlayer = state.currentPlayer === 'X' ? 'O' : 'X';
    await msg.reply(`✅ Jogada registrada.\n${renderBoard(state.board)}\nVez do jogador: ${state.currentPlayer}`);
  },
};