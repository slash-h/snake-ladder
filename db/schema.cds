namespace snakeladder;

//Status
type TurnStatus    : String enum {
  Waiting; // Session created, not yet started
  Playing; // It's this player's turn — roll the dice!
  Moving; // Dice rolled, player token is being moved
  Blocked; // Player hit a double-headed snake — skips next turn
  Finished; // This player has reached square 100 and won
};

// Game Session Status
type SessionStatus : String enum {
  Lobby; // Game did not start yet, Players can join
  InProgress; // Game in progress
  Complete; // Game finished, a player won
}

// ── Board square — pre-loaded with snake/ladder data
entity BoardSquares {
  key square       : Integer; // 1–100
      snakeTo      : Integer; // 0 if no snake on this square
      ladderTo     : Integer; // 0 if no ladder on this square
      isDoubleHead : Boolean default false; // true if this is a double-headed snake mouth
}

// ── Game session
@flow.status: SessionStatus
entity GameSessions {
  key ID            : UUID;
      name          : String(100);

      @cds.on.insert: $now
      createdAt     : Timestamp;
      startedAt     : Timestamp;
      finishedAt    : Timestamp;
      winner        : Association to Players;

      @readonly
      SessionStatus : SessionStatus default #Lobby
}

// Player  — one row per player per session
@flow.status: TurnStatus
entity Players {
  key ID            : UUID;
      session       : Association to GameSessions;
      name          : String(100);

      @readonly
      position      : Integer default 1; // current square (0-100)

      @readonly
      TurnStatus    : TurnStatus default #Waiting;
      turnOrder     : Integer; // 1 = goes first
      turnsBlocked  : Integer;
      lastRoll      : Integer; // last dice result
      prevPosition  : Integer default 1; // position before last roll
      lastEventType : String(20); // event from last roll: normal|ladder|snake|doubleSnake
}
// Why @flow.status on Players? Each player is an independent state machine.
// Their TurnStatus transitions independently — one player is Playing while others are Waiting.

// TurnLog - stores every move
entity TurnLog {
  key ID         : UUID;
      session    : Association to GameSessions;
      player     : Association to Players;
      turnNumber : Integer;
      diceRoll   : Integer;
      fromSquare : Integer;
      toSquare   : Integer;
      eventType  : String(20); // 'normal'|'ladder'|'snake'|'doubleSnake'|'win'|'blocked'
      timestamp  : Timestamp;


}
