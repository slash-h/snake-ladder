using {snakeladder} from '../db/schema';

/**
 * Snake & Ladder Game Service — multiplayer board game engine.
 * Players take turns rolling dice and moving tokens across a 10×10 board.
 * Snakes send players back; ladders advance them. First to reach square 100 wins.
 */
@mcp
@protocol: [
  'odata-v4',
  'mcp'
] // keep OData alongside MCP is REQUIRED otherwise OData access drops
@title   : 'Snake & Ladder Game'
@path    : 'GameService'
service GameService {

      @title      : 'Game Sessions'
      @description: 'Create a session, add players, then call startGame. SessionStatus: Lobby → InProgress → Complete.'
      @flow.status: SessionStatus
  entity GameSessions as projection on snakeladder.GameSessions
    actions {
      @from       : [ #Lobby]       @to: #InProgress
      action startGame();

      @from       : [ #InProgress]  @to: #Complete
      action endGame();
    };

      @title      : 'Players'
      @description: 'Each player has a position (1-100) and TurnStatus. Call rollDice when Playing, then confirmMove to end the turn.'
      @flow.status: TurnStatus
      @cds.redirection.target
  entity Players      as projection on snakeladder.Players
    actions {

      @from       : [ #Waiting]  @to: #Playing
      action startTurn();

      /**
           * Roll a 6-sided dice and move the player.
           * Returns: roll (1-6), position (new square after snakes/ladders), event (normal/ladder/snake/doubleSnake).
           */
      @from       : [ #Playing]  @to: #Moving
      action rollDice() returns {
        roll     : Integer;
        position : Integer;
        event    : String;
      };

      @from       : [ #Moving]   @to: #Waiting // transition to next player
      action confirmMove();

      @from       : [ #Moving]   @to: #Blocked // double-header snake bite
      action blockPlayer();

      @from       : [ #Blocked]  @to: $flow.previous // restores pre-block status
      action unblockPlayer();

      @from       : [ #Moving]   @to: #Finished
      action winGame();

      @from       : [ #Blocked]  @to: $flow.previous
      action skipTurn();
    };

  @title      : 'Board State'
  @description: 'Live view of all player positions. Filter by session_ID to see a specific game.'
  @readonly
  entity BoardState   as
    select from snakeladder.Players {
      key ID,
          name,
          position,
          TurnStatus,
          lastRoll,
          session.ID   as session_ID : UUID, // typed alias — makes session_ID OData-filterable
          session.name as sessionName
    };

  entity BoardSquares as projection on snakeladder.BoardSquares;

  entity TurnLog      as projection on snakeladder.TurnLog;

  event TurnComplete {
    sessionID    : UUID;
    playerID     : UUID;
    nextPlayerID : UUID;
    turnNumber   : Integer;
  } // As opposed to the other events, this event is added inside the service block so it appears in OData $metadata and the MCP describe tool

  // Bound actions on entities aren't directly callable by the AI.
  // Therefore we add unbound service functions that the AI can call via per_action_tool
  /** Start a game session. Requires sessionID of a Lobby session with ≥2 players. */
  function mcpStartGame(sessionID: UUID)  returns String;

  /** Roll the dice for the current Playing player. */
  function mcpRollDice(playerID: UUID)    returns {
    roll     : Integer;
    position : Integer;
    event    : String;
  };

  /** Confirm a move and rotate the turn to the next player. */
  function mcpConfirmMove(playerID: UUID) returns String;

  /** Get the current board state for a game session. */
  function mcpBoardState(sessionID: UUID) returns array of {
    name       : String;
    position   : Integer;
    TurnStatus : String;
    lastRoll   : Integer;
  };

  /** All 100 squares with snake/ladder info. */
  function mcpBoardMap()                  returns array of {
    square       : Integer;
    snakeTo      : Integer;
    ladderTo     : Integer;
    isDoubleHead : Boolean;
  };
}

// Domain Events - emitted by action handlers
event BoardEvent {
  playerID : UUID;
  type     : String; // 'ladder' | 'snake'  | 'doubleSnake'
  ![from]  : Integer; // 'from' and 'to' are CAP reserved keywords, escape them with ![]
  ![to]    : Integer;
}

event GameWon {
  playerID  : UUID;
  sessionID : UUID;
}
