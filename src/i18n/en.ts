// Every word this app says in English. It is also the source of the key type:
// a key that is not here does not exist, and every other language fills the
// same shape.
//
// A line the engine writes about a player carries {placeholders}: a name, a
// count, or a role, which is filled from the reader's own language.
export const en = {
  // ------------------------------------------------------------- the phases
  'phase.Night': 'Night',
  'phase.Day': 'Day',
  'phase.Vote': 'Vote',
  'phase.Revenge': 'Revenge',
  'phase.Debate': 'Debate',
  'phase.Election': 'Election',
  'phase.Succession': 'Succession',
  'phase.Scapegoat': 'Scapegoat',
  'phase.Judge': 'Judge',

  // ----------------------------------------------------------- the journal
  'info.round': 'Round {round} · {phase}',
  'info.vote': 'The vote',
  'info.dead': 'The dead',
  'info.seer': 'The seer',
  'info.table': 'The table',

  // ------------------------------------------------------------- the table
  'log.rolesDealt': '{count} players were dealt their roles.',
  'log.electionOpens': 'The table elects a mayor before the first night.',

  // ------------------------------------------------------------ the deaths
  'log.deathNight': '{name} did not survive the night.',
  'log.deathNightCard': '{name} did not survive the night. He was the {role}.',
  'log.deathNightMany': '{names} did not survive the night.',
  'log.quietNight': 'nobody died in the night.',
  'log.dayDeath': '{name} has died.',
  'log.dayDeathCard': '{name} has died. He was the {role}.',
  'log.hunterShot': '{hunter} took {target} down.',
  'log.hunterShotCard': '{hunter} took {target} down. He was the {role}.',
  'log.votedOut': '{name} was voted out.',
  'log.votedOutCard': '{name} was voted out. He was the {role}.',
  'log.scapegoatDead': '{name}, the scapegoat, is dead.',
  'log.noSuccessor': 'The mayor is dead, and nobody is left to take the seat.',

  // ------------------------------------------------------------- the vote
  'log.vote': '{voter} voted for {target}.',
  'log.noVote': "{voter} didn't vote.",
  'log.nobodyVoted': 'nobody voted.',
  'log.candidates': 'The candidates are {names}.',
  'log.mayorElected': '{name} was elected mayor.',
  'log.mayorTie': 'The mayor vote is tied between {names}. They vote again.',
  'log.noMayor': 'The table could not agree on a mayor. The night begins without one.',
  'log.voteTie': 'the vote was tied between {names}. They vote again.',
  'log.voteTieAgain': 'the vote was tied again, nobody was eliminated.',
  'log.voteTieScapegoat':
    'the vote was tied again. {name} was the scapegoat, and pays for it.',
  'log.idiotSurvives':
    '{name} was voted out and turned out to be the village idiot. He survives, and may never vote again.',
  'log.judgeRepeat': 'the judge bangs the table. One more vote, then night falls.',
  'log.scapegoatBan': 'the scapegoat bars {name} from voting tomorrow.',

  // ----------------------------------------------------------- the seer
  'log.seerSawCard': 'The seer saw the {role} card.',
  'log.seerSawWolf': 'The seer saw a Werewolf.',
  'log.seerSawNone': 'The seer saw no Werewolf.',

  // ----------------------------------------------------------- the others
  'log.bearGrowls': "the bear tamer's bear growls.",
  'log.successor': "{name} takes the mayor's seat.",
  'log.alienRight':
    'the Alien named {target} as the {role} — and was right. {target}, the {role}, is dead.',
  'log.alienWrong':
    'the Alien guessed wrong, and his guess has killed him. {alien} was the Alien.',

  // ------------------------------------------------------------ who won
  'log.villageWins': 'The Village wins.',
  'log.wolvesWin': 'The Werewolves win.',
  'log.loversWin': 'The Lovers win.',
  'log.angelWins': 'The Angel wins.',
  'log.piperWins': 'The Pied Piper wins.',
  'log.soloWins': 'The {role} wins.',

  // ------------------------------------------- the narrator's own journal
  'journal.thiefTook': 'Night 1: {name} took the {role}.',
  'journal.thiefKept': 'Night 1: {name} kept his own card.',
  'journal.judgeRepeat': 'Day {round}: the judge demanded one more vote.',
  'journal.ravenMark': 'Day {round}: the raven marked {name}.',
  'journal.alienRight': 'Day {round}: the Alien named {name} as the {role} and was right.',
  'journal.alienWrong': 'Day {round}: the Alien named {name} as the {role} and was wrong.',
  'journal.packNobody': 'Night {round}: the pack named nobody, and no one was taken.',
  'journal.packTiePick':
    "Night {round}: the pack's vote was split, and the victim chosen was {name}.",
  'journal.silenced': 'Night {round}: the Red Wolf silenced {name}.',
  'journal.shielded': 'Night {round}: the guard saved {name} from the {source}.',
  'journal.healed': 'Night {round}: the witch saved {name} from the {source}.',
  'journal.devoured': 'Night {round}: {name} was devoured by the {source}.',
  'journal.attackedNoEffect': 'Night {round}: the {source} attacked {name}, and it did nothing.',
  'journal.quietNight': 'Night 1 was peaceful: the wolves only looked around.',
  'journal.poisoned': 'Night {round}: {name} was poisoned.',
  'journal.cupidTied': 'Cupid tied {first} and {second} together.',
  'journal.foxFound':
    'Night {round}: the fox sniffed around {name} and found a wolf.',
  'journal.foxNothing':
    'Night {round}: the fox sniffed around {name} and found nothing.',
  'journal.piperCharmed': 'Night {round}: the piper charmed {names}.',
  'journal.sideWolves': 'Night 1: {name} chose the wolves.',
  'journal.sideVillage': 'Night 1: {name} chose the village.',
  'journal.modelWatch': 'Night 1: {name} watches over {model}.',
  'journal.nobodyDied': 'Night {round}: nobody died.',
  'journal.infectionSlid': 'Night {round}: the infection slid off {name}.',
  'journal.infectionShielded':
    "Night {round}: the guard's shield kept the infection off {name}.",
  'journal.infected': 'Night {round}: {name} was infected and is a werewolf now ({role}).',
  'journal.turned': 'Round {round}: {name} lost {model} and turned.',
  'journal.brokenHeartNight': 'Night {round}: {name} died of a broken heart.',
  'journal.brokenHeartDay': 'Day {round}: {name} died of a broken heart.',
  'journal.noAnswer': '{name} did not answer in time.',
  'journal.tookNobody': '{name} took nobody down.',

  // ------------------------------------------------- the private line
  'secret.thiefTookCard': 'You are the {role} now.',
  'secret.thiefKept': 'You keep your own card.',
  'secret.noAnswer': 'You did not answer in time. The game moved on without you.',
  'secret.silenced':
    'You have been silenced: your powers fail until the end of the coming day.',
  'secret.spied': 'You saw the wolves awake: {names}.',
  'secret.spiedNobody': 'You saw nobody awake tonight.',
  'secret.loversTied':
    'You are tied to {name}. If either of you dies, the other dies too.',
  'secret.seerExact': '{name} is the {role}.',
  'secret.seerWolf': '{name} is a Werewolf.',
  'secret.seerNotWolf': '{name} is not a Werewolf.',
  'secret.foxFound': 'Yes: a wolf is among {names}. Your nose stays sharp.',
  'secret.foxNothing': 'No: no wolf is among {names}. Your nose is gone for good.',
  'secret.charmed': 'The Pied Piper played for you: you are charmed.',
  'secret.flock':
    'Your flock so far: {names}. Charm every player still alive and the game is yours.',
  'secret.packRuns': 'You run with the wolves now.',
  'secret.stayVillage': 'You stay with the village for good.',
  'secret.modelWatch': 'You watch over {model}. The day they die, you become a werewolf.',
  'secret.turned': '{model} is dead. You are a werewolf now.',
  'secret.infected':
    'You have been infected: you are a werewolf now, and you keep your powers.',
  'secret.alienRight': '{name} was {role} and is dead. Point again, or let the day go on.',
  'secret.alienWrong': '{name} was not that role. The guess has killed you.',
};

export type Catalog = typeof en;
export type Key = keyof Catalog;
