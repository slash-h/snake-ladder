const cds = require('@sap/cds')

module.exports = class GameService extends cds.ApplicationService {
    async init() {

        const { Players, BoardSquares } = this.entities;

        // ── startTurn
        // @from: [#Waiting]  →  CAP validates status before this runs
        // @to: #Playing      →  CAP updates status after this returns
        // No business logic needed — CAP's @flow.status handles the transition.
        this.on("startTurn", "Players", async (req) => {
            // Intentionally empty: the @from/@to annotations do all the work.
            // console.log("startTurn action triggered")
        })

        // ── rollDice
        // @from: [#Playing]  →  CAP validates status before this runs
        // @to: #Moving       →  CAP updates status after this returns
        this.on("rollDice", "Players", async (req) => {
            // console.log("rollDice action triggered")
            const player = await SELECT.one.from(Players).where({ ID: req.params[0].ID })
            if (!player) return req.error(400, "Player not found");

            const roll = Math.ceil(Math.random() * 6)
            let newPosition = player.position + roll;

            // Validate that the newPosition doesn't go beyond 100 (the BoardSquares boundry)
            if (newPosition > 100) {
                // await UPDATE(Players).set({ lastRoll: roll }).where({ID: player.ID})
                const needed = 100 - player.position
                return req.error(409, `Need exactly ${needed} to finish. Rolled ${roll}. No move`)
            }

            // Resolve snake or ladded on the new square (newPosition)
            const square = await SELECT.one.from(BoardSquares).where({ square: newPosition });
            let finalPosition = newPosition
            let event = null

            if (square?.ladderTo) {
                finalPosition = square.ladderTo
                event = { type: "ladder", "from": newPosition, "to": finalPosition }
            } else if (square?.snakeTo) {
                finalPosition = square.snakeTo;
                event = square.isDoubleHead
                    ? { type: "doubleSnake", "from": newPosition, "to": finalPosition }
                    : { type: "snake", "from": newPosition, "to": finalPosition }
            }

            // Save Position and Last Roll
            await UPDATE(Players).set({ position: finalPosition, lastRoll: roll }).where({ ID: player.ID })

            // Emit domain event so subscribers can react 
            if (event) await this.emit("BoardEvent", { playerID: player.ID, ...event })

            // Use req.reply(), instead of plain 'return', to pin the response value before CAP's
            // @flow.status after-handler runs. A plain `return` gets cleared by the
            // flow machinery, producing HTTP 204 instead of the expected 200 + body.
            req.reply({ roll, position: finalPosition, event: event?.type ?? "normal" })

        })

        // ── confirmMove 
        // @from: [#Moving]  →  normal end of a turn, hands off to next player
        // @to: #Waiting     →  player waits for their next turn
        this.on("confirmMove", "Players", async (req) => {
            //For now, CAP framework handles the state change
        })

        // ── blockPlayer 
        // @from: [#Moving]  →  called when player lands on a double-headed snake
        // @to: #Blocked     →  player skips their next turn
        this.on("blockPlayer", "Players", async (req) => {
            // Business logic: the position was already updated in rollDice.
            // This action just transitions state — CAP handles the @to: #Blocked update.
            req.info("Player is blocked and will skip next turn")
        })

        // ── unblockPlayer 
        // @from: [#Blocked]   →  called at the start of a blocked player's next turn
        // @to: $flow.previous →  CAP restores the status to whatever it was before #Blocked
        this.on("unblockPlayer", "Players", async (req) => {
            // CAP's $flow.previous does the work — no code needed here.
            // The player's status returns to #Waiting automatically.
        })

        // ── winGame 
        // @from: [#Moving]  →  called when player.position === 100
        // @to: #Finished    →  player has won
        this.on("winGame", "Players", async (req) => {
            const player = SELECT.one.from(Players).where({ ID: req.params[0].ID })
            if (!player) return req.error(404, "Player not found")

            // Mark the session as finished with this player as winner
            await UPDATE("snakeladder.GameSessions").set({ finishedAt: new Date().toISOString(), winner_ID: player.ID }).where({ ID: player.ID })

            await this.emit("GameWon", { playerID: player.ID, sessionID: player.session_ID })
        })

        // -- skipTurn
        // @from: [#Blocked]   →  called at the start of a blocked player's next turn
        // @to: $flow.previous →  CAP restores the status to whatever it was before #Blocked
        this.on("skipTurn", "Players", async (req) => {
            const player = await SELECT.one.from(Players).where({ ID: req.params[0].ID })
            await UPDATE(Players)
                .set({ turnsBlocked: (player.turnsBlocked || 0) + 1 })
                .where({ ID: player.ID })
        })

        return super.init()
    }
}
