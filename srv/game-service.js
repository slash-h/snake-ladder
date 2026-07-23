const cds = require('@sap/cds');
const { timeStamp } = require('node:console');

module.exports = class GameService extends cds.ApplicationService {
    async init() {

        const { Players, BoardSquares, TurnLog } = this.entities;

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
            await UPDATE(Players).set({
                prevPosition: player.position,
                lastEventType: event?.type ?? 'normal', position: finalPosition, lastRoll: roll
            }).where({ ID: player.ID })

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
            //CAP framework handles the state change to #Waiting.
            //We store the turn information of the current player in TurnLog and 
            //then find the next player and set their status to 'Playing'

            const player = await SELECT.one.from(Players).where({ ID: req.params[0].ID })
            if (!player) return req.error(404, "Player not found!")

            // Check current player win condition before handing off to next player
            if (player.position === 100) {
                //Delicate to winGame action
                await this.send({ event: 'winGame', entity: Players, params: [{ ID: player.ID }] })
                return
            }

            //Log this turn
            const [{ n: count }] = await SELECT`COUNT(*) as n`.from(TurnLog).where({ session_ID: player.session_ID })
            const turnNumber = (count || 0) + 1
            await INSERT.into(TurnLog).entries({
                ID: cds.utils.uuid(),
                session_ID: player.session_ID,
                player_ID: player.ID,
                turnNumber,
                diceRoll: player.lastRoll,
                fromSquare: player.prevPosition,   // pre-roll position stored by rollDice
                toSquare: player.position,
                eventType: player.lastEventType ?? 'normal',   // event type stored by rollDice
                timeStamp: new Date().toISOString()
            });

            // Find next player
            const players = await SELECT.from(Players).where({ session_ID: player.session_ID }).orderBy('turnOrder')

            const idx = players.findIndex(p => p.ID === player.ID)
            // Skip finished players — guard counter prevents infinite loop if all finish simultaneously
            let nextIdx = (idx + 1) % players.length
            let guard = 0
            while (players[nextIdx].TurnStatus === 'Finished' && guard++ < players.length) {
                nextIdx = (nextIdx + 1) % players.length
            }
            const next = players[nextIdx]

            await this.emit('TurnComplete', {
                sessionID: player.session_ID,
                playerID: player.ID,
                nextPlayerID: next.ID,
                turnNumber
            })

            // Activate next player — use direct UPDATE, not the flow action,
            // because we're already inside a handler
            await UPDATE(Players)
                .set({ TurnStatus: 'Playing' })
                .where({ ID: next.ID })

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
