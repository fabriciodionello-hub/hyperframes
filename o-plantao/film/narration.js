// Single source of truth for timing: the recorded narration.
//
// CHUNKS are the pause-delimited stretches of speech in assets/audio/narracao.mp3 (silences >= 0.18 s
// at -38 dB), each matched to its words with Whisper. All film timing hangs off these, so the picture,
// the captions and the sound effects land on the words that say them.

/** Seconds of picture before the narration starts (title only). */
export const T0 = 1.5;
/** Length of the narration file. */
export const NARRATION = 103.471;
/** Length of the film: narration plus the hold on the end card. */
export const DURATION = 109.0;
export const FPS = 30;

// [start, end, text] in narration time
export const CHUNKS = [
  [0.0, 1.84, "Duas e quarenta da madrugada."], // 0
  [2.12, 2.87, "O rádio chiou."], // 1
  [3.28, 5.08, "Parada cardíaca na sala dois."], // 2
  [5.61, 6.0, "Eu larguei"], // 3
  [6.2, 6.89, "tudo e corri."], // 4
  [7.3, 7.82, "Na UPA,"], // 5
  [8.06, 9.34, "a noite nunca termina."], // 6
  [9.89, 10.6, "Seu Vanderlei,"], // 7
  [10.83, 12.04, "cinquenta e oito anos."], // 8
  [12.31, 12.92, "Sem pulso."], // 9
  [13.46, 15.73, "A doutora Fernanda mandou todo mundo se afastar."], // 10
  [16.15, 16.84, "Primeiro choque."], // 11
  [17.36, 19.28, "A Dona Cida contava as compressões."], // 12
  [19.57, 21.73, "Eu peguei a adrenalina e injetei na veia."], // 13
  [22.15, 23.06, "Segundo choque."], // 14
  [23.51, 24.43, "O monitor piscou."], // 15
  [25.08, 25.42, "E..."], // 16
  [25.96, 26.29, "nada."], // 17
  [26.85, 28.22, "Até que a linha começou a subir."], // 18
  [28.56, 29.21, "Tinha pulso."], // 19
  [29.69, 32.59, "A Dona Cida soltou um graças a Deus baixinho."], // 20
  [33.0, 34.88, "A doutora me mandou levar ele pra UTI."], // 21
  [35.34, 37.69, "Eu tirei a luva achando que o pior já tinha passado."], // 22
  [38.06, 39.02, "Aí o rádio avisou:"], // 23
  [39.34, 41.66, "Ambulância chegando. Duas vítimas de moto."], // 24
  [42.05, 44.12, "Eu procurei o Marcos, meu parceiro de plantão."], // 25
  [44.47, 47.08, "A Dona Cida disse que ele tinha ido ver uns carros lá fora."], // 26
  [47.43, 48.22, "Fazia meia hora."], // 27
  [48.56, 49.39, "Abri o celular."], // 28
  [49.7, 50.85, "A última mensagem dele:"], // 29
  [51.24, 53.41, "Um carro de luz apagada, lá no fundo."], // 30
  [53.8, 54.4, "Eu travei."], // 31
  [54.89, 56.48, "A Dona Cida olhou pra mim e falou:"], // 32
  [56.81, 57.31, "Vai, menino."], // 33
  [57.62, 58.7, "Eu seguro a sala dois."], // 34
  [59.0, 60.42, "As portas da ambulância abriram."], // 35
  [60.78, 63.32, "Juliana, dezenove anos, braço torcido."], // 36
  [63.82, 66.49, "Ela apertou minha mão e disse que o irmão também tava na moto."], // 37
  [66.78, 68.37, "Lá de dentro, a doutora gritou:"], // 38
  [68.6, 70.67, "o irmão dela tava convulsionando na sala um."], // 39
  [70.94, 72.54, "Mas eu olhei pra porta dos fundos."], // 40
  [73.41, 73.78, "E vi,"], // 41
  [74.08, 75.06, "caído na escada,"], // 42
  [75.48, 76.58, "o crachá do Marcos."], // 43
  [76.95, 77.85, "Sujo de lama."], // 44
  [78.28, 80.14, "Abri a porta. Chamei o nome dele."], // 45
  [80.58, 82.57, "Só tinha chuva, uma caçamba..."], // 46
  [83.01, 84.65, "e alguém parado no fundo do beco."], // 47
  [85.01, 87.76, "Ele veio devagar, com a mão no bolso, e disse:"], // 48
  [88.2, 88.71, "Ele tá bem."], // 49
  [88.96, 90.17, "Só precisa ficar quieto."], // 50
  [90.53, 94.16, "Atrás de mim, o rádio dizia que o irmão da Juliana tinha perdido o pulso."], // 51
  [94.59, 95.57, "E a doutora me chamando:"], // 52
  [95.75, 97.09, "Diego, volta agora!"], // 53
  [97.39, 98.08, "E eu fiquei ali."], // 54
  [98.52, 99.66, "Com uma mão na porta..."], // 55
  [99.99, 101.22, "e o resto de mim no beco."], // 56
  [101.74, 102.17, "E você?"], // 57
  [102.66, 103.22, "O que faria?"], // 58
];

/** Film time at which chunk i starts / ends. */
export const S = (i) => T0 + CHUNKS[i][0];
export const E = (i) => T0 + CHUNKS[i][1];
/** Film time for a moment given in narration time. */
export const N = (n) => T0 + n;

// Caption cards: [narrationStart, narrationEnd, text, kind]
// kind: undefined = Diego, "radio" = what the radio says (cyan + 📻)
// Splits inside a chunk sit on the measured energy dips between the words.
export const CAPTIONS = [
  [0.0, 1.84, "Duas e quarenta da madrugada."],
  [2.12, 2.87, "O rádio chiou."],
  [3.28, 5.08, "Parada cardíaca na sala dois.", "radio"],
  [5.61, 6.89, "Eu larguei tudo e corri."],
  [7.3, 9.34, "Na UPA, a noite nunca termina."],
  [9.89, 12.04, "Seu Vanderlei, cinquenta e oito anos."],
  [12.31, 12.92, "Sem pulso."],
  [13.46, 15.73, "A doutora Fernanda mandou todo mundo se afastar."],
  [16.15, 16.84, "Primeiro choque."],
  [17.36, 19.28, "A Dona Cida contava as compressões."],
  [19.57, 21.73, "Eu peguei a adrenalina e injetei na veia."],
  [22.15, 23.06, "Segundo choque."],
  [23.51, 24.43, "O monitor piscou..."],
  [25.08, 25.42, "E..."],
  [25.96, 26.29, "E... nada."],
  [26.85, 28.22, "Até que a linha começou a subir."],
  [28.56, 29.21, "Tinha pulso."],
  [29.69, 32.59, "A Dona Cida soltou um “graças a Deus” baixinho."],
  [33.0, 34.88, "A doutora me mandou levar ele pra UTI."],
  [35.34, 37.69, "Eu tirei a luva achando que o pior já tinha passado."],
  [38.06, 39.02, "Aí o rádio avisou:"],
  [39.34, 41.66, "Ambulância chegando. Duas vítimas de moto.", "radio"],
  [42.05, 44.12, "Eu procurei o Marcos, meu parceiro de plantão."],
  [44.47, 45.38, "A Dona Cida disse"],
  [45.38, 47.08, "que ele tinha ido ver uns carros lá fora."],
  [47.43, 48.22, "Fazia meia hora."],
  [48.56, 49.39, "Abri o celular."],
  [49.7, 50.85, "A última mensagem dele:"],
  [51.24, 53.41, "“Um carro de luz apagada, lá no fundo.”"],
  [53.8, 54.4, "Eu travei."],
  [54.89, 56.48, "A Dona Cida olhou pra mim e falou:"],
  [56.81, 58.7, "“Vai, menino. Eu seguro a sala dois.”"],
  [59.0, 60.42, "As portas da ambulância abriram."],
  [60.78, 63.32, "Juliana, dezenove anos, braço torcido."],
  [63.82, 65.055, "Ela apertou minha mão e disse"],
  [65.055, 66.49, "que o irmão também tava na moto."],
  [66.78, 68.37, "Lá de dentro, a doutora gritou:"],
  [68.6, 70.67, "o irmão dela tava convulsionando na sala um."],
  [70.94, 72.54, "Mas eu olhei pra porta dos fundos."],
  [73.41, 75.06, "E vi, caído na escada..."],
  [75.48, 76.58, "o crachá do Marcos."],
  [76.95, 77.85, "Sujo de lama."],
  [78.28, 80.14, "Abri a porta. Chamei o nome dele."],
  [80.58, 82.57, "Só tinha chuva, uma caçamba..."],
  [83.01, 84.65, "e alguém parado no fundo do beco."],
  [85.01, 87.76, "Ele veio devagar, com a mão no bolso, e disse:"],
  [88.2, 90.17, "“Ele tá bem. Só precisa ficar quieto.”"],
  [90.53, 92.09, "Atrás de mim, o rádio dizia que"],
  [92.09, 94.16, "o irmão da Juliana tinha perdido o pulso.", "radio"],
  [94.59, 95.57, "E a doutora me chamando:"],
  [95.75, 97.09, "“Diego, volta agora!”"],
  [97.39, 98.08, "E eu fiquei ali."],
  [98.52, 99.66, "Com uma mão na porta..."],
  [99.99, 101.22, "e o resto de mim no beco."],
];

/** The end card replaces the caption for the last line ("E você? O que faria?"). */
export const CARD_AT = T0 + 101.74;
