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
            action rollDice();

            @from: [ #Moving]   @to: #Waiting // transition to next player
            action confirmMove();

            @from: [ #Moving]   @to: #Blocked // double-header snake bite
            action blockPlayer();

            @from: [ #Blocked]  @to: $flow.previous // restores pre-block status
            action unblockPlayer();

            @from: [ #Moving]   @to: #Finished
            action winGame();
        };

    entity BoardSquares as projection on snakeladder.BoardSquares;


}
