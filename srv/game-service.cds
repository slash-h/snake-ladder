using {snakeladder} from '../db/schema';

@path: 'GameService'
service GameService {

    entity GameSessions as projection on snakeladder.GameSessions;

            @flow.status: TurnStatus
    entity Players      as projection on snakeladder.Players
        actions {

            @from: [ #Waiting]  @to: #Playing
            action startTurn();

            @from: [ #Playing]  @to: #Moving
            action rollDice() returns {
                roll     : Integer;
                position : Integer;
                event    : String;
            };

            @from: [ #Moving]   @to: #Waiting // transition to next player
            action confirmMove();

            @from: [ #Moving]   @to: #Blocked // double-header snake bite
            action blockPlayer();

            @from: [ #Blocked]  @to: $flow.previous // restores pre-block status
            action unblockPlayer();

            @from: [ #Moving]   @to: #Finished
            action winGame();

            @from: [ #Blocked]  @to: $flow.previous
            action skipTurn();
        };

    entity BoardSquares as projection on snakeladder.BoardSquares;

    entity TurnLog      as projection on snakeladder.TurnLog;

    event TurnComplete {
        sessionID    : UUID;
        playerID     : UUID;
        nextPlayerID : UUID;
        turnNumber   : Integer;
    } // As opposed to the other events, this event is added inside the service block so it appears in OData $metadata and the MCP describe tool
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
