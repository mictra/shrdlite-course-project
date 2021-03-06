///<reference path="World.ts"/>
///<reference path="Interpreter.ts"/>
///<reference path="Graph.ts"/>

/**
* Planner module
*
* The goal of the Planner module is to take the interpetation(s)
* produced by the Interpreter module and to plan a sequence of actions
* for the robot to put the world into a state compatible with the
* user's command, i.e. to achieve what the user wanted.
*/
module Planner {

    //////////////////////////////////////////////////////////////////////
    // exported functions, classes and interfaces/types

    /**
     * Top-level driver for the Planner. Calls `planInterpretation` for each given interpretation generated by the Interpreter.
     * @param interpretations List of possible interpretations.
     * @param currentState The current state of the world.
     * @returns Augments Interpreter.InterpretationResult with a plan represented by a list of strings.
     */
    export function plan(interpretations: Interpreter.InterpretationResult[], currentState: WorldState): PlannerResult[] {
        var errors: Error[] = [];
        var plans: PlannerResult[] = [];
        interpretations.forEach((interpretation) => {
            try {
                var result: PlannerResult = <PlannerResult>interpretation;
                result.plan = planInterpretation(result.interpretation, currentState);
                if (result.plan.length == 0) {
                    result.plan.push("That is already true!");
                }
                plans.push(result);
            } catch (err) {
                errors.push(err);
            }
        });
        if (plans.length) {
            return plans;
        } else {
            // only throw the first error found
            throw errors[0];
        }
    }

    export interface PlannerResult extends Interpreter.InterpretationResult {
        plan: string[];
    }

    export function stringify(result: PlannerResult): string {
        return result.plan.join(", ");
    }

    //////////////////////////////////////////////////////////////////////
    // private functions

    /**
     * NodeState is used to identify a WorldState for the interpreation planning.
     * The id is used to differentiate between different NodeStates.
     */
    class NodeState {
        // Identifier for each NodeState
        id: string;

        constructor(
            public arm: number,
            public holding: string,
            public stacks: Stack[],
            public command: string,
            public objDefs: { [s: string]: ObjectDefinition; }) {
            this.id = this.stacks + this.holding + this.arm + this.command;
        }


        compareTo(other: NodeState): number {
            if (this.id == other.id) {
                return 0;
            }
            return -1;
        }

        toString(): string {
            return this.id;
        }

        /**
         * This functions checks for a given literal, if its goal state is true.
         * All possible literal relations if they are fulfilled and thus,
         * if a part of the overall goal is true.
         * @param literal The literal for which it is checked if it is fulfilled.
         * @returns boolean if given literals goal state is fulfilled, returns true.
         */
        isLiteralGoal(literal: Interpreter.Literal): boolean {
            if (literal.relation == "holding") {
                return literal.args[0] == this.holding;
            }

            var columnIndex: number = Interpreter.getColumnIndex(literal.args[0], this.stacks);

            if (columnIndex == null) {
                return false;
            }
            // Might be null if columnIndex is null (which is the case when looking for an object the robot is already holding)
            var stackIndex: number = Interpreter.getStackIndex(literal.args[0], columnIndex, this.stacks);

            switch (literal.relation) {
                case "inside":
                    if (Interpreter.isInside([literal.args[1]], columnIndex, stackIndex - 1, this.stacks, this.objDefs)) {
                        return true;
                    }
                    break;
                case "ontop":
                    if (Interpreter.isOnTop([literal.args[1]], columnIndex, stackIndex - 1, this.stacks, this.objDefs)) {
                        return true;
                    }
                    break;
                case "leftof":
                    if (Interpreter.isLeftOf([literal.args[1]], columnIndex, this.stacks)) {
                        return true;
                    }
                    break;
                case "rightof":
                    if (Interpreter.isRightOf([literal.args[1]], columnIndex, this.stacks)) {
                        return true;
                    }
                    break;
                case "beside":
                    if (Interpreter.isBeside([literal.args[1]], columnIndex, this.stacks)) {
                        return true;
                    }
                    break;
                case "above":
                    if (Interpreter.isAbove([literal.args[1]], columnIndex, stackIndex, this.stacks)) {
                        return true;
                    }
                    break;
                case "under":
                    if (Interpreter.isUnder([literal.args[1]], columnIndex, stackIndex + 1, this.stacks)) {
                        return true;
                    }
                    break;
            }

            return false;
        }
    }

    /**
     * The StateGraph represents a Graph with NodeStates.
     */
    class StateGraph implements Graph<NodeState>{
        constructor(
            public objDefs: { [s: string]: ObjectDefinition; }
            ) { }


        outgoingEdges(node: NodeState): Edge<NodeState>[] {
            var outgoing: Edge<NodeState>[] = [];

            // Can pick up
            if (node.holding == null && node.stacks[node.arm].length != 0) {
                var edge: Edge<NodeState> = new Edge<NodeState>();
                edge.from = node;
                edge.cost = 1;
                var stacks: Stack[] = this.cloneStacks(node.stacks);
                var holding: string = stacks[node.arm].pop();
                edge.to = new NodeState(node.arm, holding, stacks, "p", node.objDefs);
                outgoing.push(edge);
            }
            // Can move right
            if (node.arm < node.stacks.length - 1) {
                var edge: Edge<NodeState> = new Edge<NodeState>();
                edge.from = node;
                edge.cost = 1;
                edge.to = new NodeState(node.arm + 1, node.holding, this.cloneStacks(node.stacks), "r", node.objDefs);
                outgoing.push(edge);
            }
            // Can move left
            if (node.arm > 0) {
                var edge: Edge<NodeState> = new Edge<NodeState>();
                edge.from = node;
                edge.cost = 1;
                edge.to = new NodeState(node.arm - 1, node.holding, this.cloneStacks(node.stacks), "l", node.objDefs);
                outgoing.push(edge);
            }
            // To be able to drop, check that the arm is holding something and that inside/ontop is valid
            if (node.holding != null) {
                var holding: string = node.holding;
                var stack: Stack = node.stacks[node.arm];
                var topObject: string = ((stack.length) > 0) ? stack[stack.length - 1] : "floor";

                // Using isValidGoal() function in Interpreter to check physical laws
                if (Interpreter.isValidGoal("inside", this.objDefs, holding, topObject) ||
                    Interpreter.isValidGoal("ontop", this.objDefs, holding, topObject)) {
                    var edge: Edge<NodeState> = new Edge<NodeState>();
                    edge.from = node;
                    edge.cost = 1;
                    var stacks: Stack[] = this.cloneStacks(node.stacks);
                    stacks[node.arm].push(node.holding);
                    edge.to = new NodeState(node.arm, null, stacks, "d", node.objDefs);
                    outgoing.push(edge);
                }
            }

            return outgoing;
        }

        compareNodes(a: NodeState, b: NodeState): number {
            return a.compareTo(b);
        }

        cloneStacks(stacks: Stack[]): Stack[] {
            var clonedStacks: Stack[] = [];

            for (var i = 0; i < stacks.length; i++) {
                var clonedStack: Stack = [];
                for (var j = 0; j < stacks[i].length; j++) {
                    clonedStack.push(stacks[i][j]);
                }
                clonedStacks.push(clonedStack);
            }

            return clonedStacks;
        }
    }

    /**
     * @param interpretation The logical interpretation of the user's desired goal. The plan needs to be such that by executing it, the world is put into a state that satisfies this goal.
     * @param state The current world state.
     * @returns Basically, a plan is a
     * stack of strings, which are either system utterances that
     * explain what the robot is doing (e.g. "Moving left") or actual
     * actions for the robot to perform, encoded as "l", "r", "p", or
     * "d". The code shows how to build a plan. Each step of the plan can
     * be added using the `push` method.
     */
    function planInterpretation(interpretation: Interpreter.DNFFormula, state: WorldState): string[] {
        var startNode: NodeState = new NodeState(state.arm, state.holding, state.stacks, null, state.objects);
        // A* search is performed
        var searchResult: SearchResult<NodeState> = aStarSearch(new StateGraph(state.objects), startNode, isGoal, heuristics, 30);
        var plan: string[] = [];

        // transforms from the searchResult.path to a plan describing what it is doing.
        for (var i = 0; i < searchResult.path.length; i++) {
            var node: NodeState = searchResult.path[i];
            if (node.command != null) {
                if (node.command == "p" || node.command == "d") {
                    plan.push(describeMove(node, i == searchResult.path.length - 1, node.command));
                }
                plan.push(node.command);
            }
        }

        console.log("Number of commands: " + plan.length);
        return plan;

        /**
         * Creates a description for the currently performed move.
         * @param node The NodeState holding all information about the current state.
         * @param isLastInd If it is the last index.
         * @param cmd The command letter.
         * @returns the description.
         */
        function describeMove(node: NodeState, isLastInd: boolean, cmd: string): string {
            var description: string = "";
            if (cmd == "p") {
                if (isLastInd) {
                    description += "Taking the ";
                } else {
                    description += "Moving the ";
                }
            } else {
                description += "Dropping the ";
            }

            var objDef: ObjectDefinition;
            if (cmd == "p") {
                objDef = node.objDefs[node.holding];
                description += objDef.size + " " + objDef.color + " " + objDef.form;
            } else {
                var stack: Stack = node.stacks[node.arm];
                objDef = node.objDefs[stack[stack.length - 1]];
                description += objDef.size + " " + objDef.color + " " + objDef.form;
                if (stack.length == 1) {
                    description += " on the floor";
                } else {
                    var objDef2: ObjectDefinition = node.objDefs[stack[stack.length - 2]];
                    if (objDef2.form == "box") {
                        description += " inside the " + objDef2.size + " " + objDef2.color + " " + objDef2.form;
                    } else {
                        description += " on top the " + objDef2.size + " " + objDef2.color + " " + objDef2.form;
                    }
                }
            }

            return description;
        }

        /**
         * Checks if the given NodeState node is a goal state
         */
        function isGoal(node: NodeState): boolean {
            for (var i = 0; i < interpretation.length; i++) {
                // Shows, if the whole conjunction evaluates to true.
                var conjunctionFlag: boolean = true;
                for (var j = 0; j < interpretation[i].length; j++) {
                    if (!node.isLiteralGoal(interpretation[i][j])) {
                        conjunctionFlag = false;
                        break;
                    }
                }

                if (conjunctionFlag) {
                    return true;
                }
            }

            return false;
        }

        /**
         * The heuristics function. Takes a NodeState and returns the estimated amount of steps required
         * to get from the given NodeState to a goal state.
         */
        function heuristics(node: NodeState): number {
            var currentCost = Infinity;

            /**
             * both for-loops iterate together through all interpretation literals and for each literal
            */
            for (var i = 0; i < interpretation.length; i++) {
                var hCost: number = Infinity;
                for (var j = 0; j < interpretation[i].length; j++) {
                    var literal: Interpreter.Literal = interpretation[i][j];
                    if (node.isLiteralGoal(literal)) {
                        return 0;
                    }
                    var nrObjectsAbove = (index: number): number => Interpreter.aboveObjects(literal.args[index], node.stacks);
                    var armToTarget = (index: number): number => Math.abs(node.arm - Interpreter.getColumnIndex(literal.args[index], node.stacks));
                    var distBtwObjs: number = Math.abs(Interpreter.getColumnIndex(literal.args[0], node.stacks) - Interpreter.getColumnIndex(literal.args[1], node.stacks));

                    switch (literal.relation) {
                        case "holding":
                            hCost = (nrObjectsAbove(0) * 4) + armToTarget(0);
                            break;
                        case "inside":
                        case "ontop":
                            hCost = ((nrObjectsAbove(0) + nrObjectsAbove(1)) * 3) + armToTarget(0) + armToTarget(1);
                            break;
                        case "under":
                            hCost = (nrObjectsAbove(1) * 4) + distBtwObjs + armToTarget(1);
                            break;
                        case "above":
                            hCost = (nrObjectsAbove(0) * 4) + distBtwObjs + armToTarget(0);
                            break;
                        case "leftof":
                        case "rightof":
                            hCost = (nrObjectsAbove(0) * 4) + distBtwObjs + armToTarget(0);
                            break;
                        case "beside":
                            hCost = (nrObjectsAbove(0) * 4) + distBtwObjs + armToTarget(0) - 1;
                            break;
                    }
                }

                if (hCost < currentCost) {
                    currentCost = hCost;
                }
            }

            return currentCost;
        }

    }

}
