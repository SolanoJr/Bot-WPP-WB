import { ICommand } from "./types";

export const cantadaCommand: ICommand = {
  name: "cantada",
  description: "Envia uma cantada aleatória.",
  async execute(msg: any) {
    const cantadas = [
      "Você não é Wi-Fi, mas sinto uma conexão forte aqui. 😉",
      "Me chama de tabela periódica e diz que rola uma química entre nós. 🧪",
      "Seu nome é Google? Porque você tem tudo o que eu procuro. 🔍",
      "Você não é GPS, mas me deixou sem rumo. 🗺️",
      "Gata, você não é o GitHub, mas eu queria fazer um push no seu coração. 💻",
      "Você não é café, mas me mantém acordado a noite inteira. ☕",
      "Se beleza fosse tempo, você seria a eternidade. ⏳",
      "Você não é Bluetooth, mas estou sentindo que a gente pode se parear. 📱",
    ];
    const choice = cantadas[Math.floor(Math.random() * cantadas.length)];
    await msg.reply(choice);
  },
};
