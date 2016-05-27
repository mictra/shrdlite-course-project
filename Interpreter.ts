///<reference path="World.ts"/>
///<reference path="Parser.ts"/>

/**
* Interpreter module
*
* The goal of the Interpreter module is to interpret a sentence
* written by the user in the context of the current world state. In
* particular, it must figure out which objects in the world,
* i.e. which elements in the `objects` field of WorldState, correspond
* to the ones referred to in the sentence.
*
* Moreover, it has to derive what the intended goal state is and
* return it as a logical formula described in terms of literals, where
* each literal represents a relation among objects that should
* hold. For example, assuming a world state where "a" is a ball and
* "b" is a table, the command "put the ball on the table" can be
* interpreted as the literal ontop(a,b). More complex goals can be
* written using conjunctions and disjunctions of these literals.
*
* In general, the module can take a list of possible parses and return
* a list of possible interpretations, but the code to handle this has
* already been written for you. The only part you need to implement is
* the core interpretation function, namely `interpretCommand`, which produces a
* single interpretation for a single command.
*/
module Interpreter {

    //////////////////////////////////////////////////////////////////////
    // exported functions, classes and interfaces/types

    /**
    Top-level function for the Interpreter. It calls `interpretCommand` for each possible parse of the command. No need to change this one.
    * @param parses List of parses produced by the Parser.
    * @param currentState The current state of the world.
    * @returns Augments ParseResult with a list of interpretations. Each interpretation is represented by a lof Literals.
    */
    export function interpret(parses: Parser.ParseResult[], currentState: WorldState): InterpretationResult[] {
        var errors: Error[] = [];
        var interpretations: InterpretationResult[] = [];
        parses.forEach((parseresult) => {
            try {
                var result: InterpretationResult = <InterpretationResult>parseresult;
                result.interpretation = interpretCommand(result.parse, currentState);
                interpretations.push(result);
            } catch (err) {
                errors.push(err);
            }
        });
        if (interpretations.length) {
            return interpretations;
        } else {
            // only throw the first error found
            throw errors[0];
        }
    }

    export interface InterpretationResult extends Parser.ParseResult {
        interpretation: DNFFormula;
    }

    export type DNFFormula = Conjunction[];
    type Conjunction = Literal[];

    /**
    * A Literal represents a relation that is intended to
    * hold among some objects.
    */
    export interface Literal {
        /** Whether this literal asserts the relation should hold
         * (true polarity) or not (false polarity). For example, we
         * can specify that "a" should *not* be on top of "b" by the
         * literal {polarity: false, relation: "ontop", args:
         * ["a","b"]}.
         */
        polarity: boolean;
        /** The name of the relation in question. */
        relation: string;
        /** The arguments to the relation. Usually these will be either objects
         * or special strings such as "floor" or "floor-N" (where N is a column) */
        args: string[];
    }

    export function stringify(result: InterpretationResult): string {
        return result.interpretation.map((literals) => {
            return literals.map((lit) => stringifyLiteral(lit)).join(" & ");
            // return literals.map(stringifyLiteral).join(" & ");
        }).join(" | ");
    }

    export function stringifyLiteral(lit: Literal): string {
        return (lit.polarity ? "" : "-") + lit.relation + "(" + lit.args.join(",") + ")";
    }

    //////////////////////////////////////////////////////////////////////
    // private functions
    /**
     * The core interpretation function. The code here is just a
     * template; you should rewrite this function entirely. In this
     * template, the code produces a dummy interpretation which is not
     * connected to `cmd`, but your version of the function should
     * analyse cmd in order to figure out what interpretation to
     * return.
     * @param cmd The actual command. Note that it is *not* a string, but rather an object of type `Command` (as it has been parsed by the parser).
     * @param state The current state of the world. Useful to look up objects in the world.
     * @returns A list of list of Literal, representing a formula in disjunctive normal form (disjunction of conjunctions). See the dummy interpetation returned in the code for an example, which means ontop(a,floor) AND holding(b).
     * @throws An error when no valid interpretations can be found
     */
    function interpretCommand(cmd: Parser.Command, state: WorldState): DNFFormula {
        var cmdEntity: Parser.Entity = cmd.entity;
        var cmdLoc: Parser.Location = cmd.location;

        var cmdObjIds: string[] = [];
        var locObjIds: string[] = [];

        if (cmdEntity != null) {
            cmdObjIds = getValidObjectIds(cmdEntity.object);
        }

        if (cmdLoc != null) {
            locObjIds = getValidObjectIds(cmdLoc.entity.object);
        }

        var interpretation: DNFFormula = [];

        // Construct the goal interpretations/literals given the relation and object identifiers
        if (cmd.command == "take") {
            for (var i = 0; i < cmdObjIds.length; i++) {
                // Shouldn't be able to hold floor
                if (cmdObjIds[i] != "floor") {
                    interpretation.push([{ polarity: true, relation: "holding", args: [cmdObjIds[i]] }]);
                }
            }
        } else if (cmd.command == "move") {
            for (var i = 0; i < cmdObjIds.length; i++) {
                for (var j = 0; j < locObjIds.length; j++) {
                    if (isValidGoal(cmdLoc.relation, state, cmdObjIds[i], locObjIds[j])) {
                        interpretation.push([{ polarity: true, relation: cmdLoc.relation, args: [cmdObjIds[i], locObjIds[j]] }]);
                    }
                }
            }
        } else if (cmd.command == "put") {
            var holding: string = state.holding;
            for (var i = 0; i < locObjIds.length; i++) {
                if (isValidGoal(cmdLoc.relation, state, holding, locObjIds[i])) {
                    interpretation.push([{ polarity: true, relation: cmdLoc.relation, args: [holding, locObjIds[i]] }]);
                }
            }
        }

        // No valid interpretations was found
        if (interpretation.length == 0) {
            throw Error("No interpretations found.");
        }

        return interpretation;

        /**
         * Function that returns an array of valid object identifiers,
         * given an entity. Takes relative clauses into account (if there are any).
         */
        function getValidObjectIds(object: Parser.Object): string[] {
            var objIds: string[] = [];
            var obj: Parser.Object = object;
            var hasRelativeObj: boolean = false;
            var relativeObjLoc: Parser.Location = null;

            // Checks if object has relative clause
            if (obj.object != undefined) {
                relativeObjLoc = obj.location;
                obj = obj.object;
                hasRelativeObj = true;
            }

            if (obj.form == "floor") {
                if (hasRelativeObj) {
                    throw Error("The floor cannot have relative descriptors.");
                }
                objIds.push(obj.form);
                return objIds;
            }

            // Checks the spatial relations, if there's a relative clause
            if (hasRelativeObj) {
                var objects: string[] = getValidObjectIds(obj);
                var relatives: string[] = getValidObjectIds(relativeObjLoc.entity.object);

                for (var n = 0; n < objects.length; n++) {
                    var i: number = getColumnIndex(objects[n], state);
                    var j: number = getStackIndex(objects[n], i, state);

                    switch (relativeObjLoc.relation) {
                        case "leftof":
                            if (!isLeftOf(relatives, i, state)) {
                                continue;
                            }
                            break;
                        case "rightof":
                            if (!isRightOf(relatives, i, state)) {
                                continue;
                            }
                            break;
                        case "beside":
                            if (!isBeside(relatives, i, state)) {
                                continue;
                            }
                            break;
                        case "inside":
                            if (!isInside(relatives, i, j - 1, state)) {
                                continue;
                            }
                            break;
                        case "ontop":
                            if (!isOnTop(relatives, i, j - 1, state)) {
                                continue;
                            }
                            break;
                        case "above":
                            if (!isAbove(relatives, i, j, state)) {
                                continue;
                            }
                            break;
                        case "under":
                            if (!isUnder(relatives, i, j + 1, state)) {
                                continue;
                            }
                            break;
                    }

                    objIds.push(objects[n]);
                }
            } else {
                var anyForm: boolean = obj.form == "anyform";
                var anyColor: boolean = obj.color == null;
                var anySize: boolean = obj.size == null;

                for (var i = 0; i < state.stacks.length; i++) {
                    for (var j = 0; j < state.stacks[i].length; j++) {

                        var objId: string = state.stacks[i][j];
                        var objDef: ObjectDefinition = state.objects[objId];

                        if (!anyForm && objDef.form != obj.form) {
                            continue;
                        }
                        if (!anyColor && objDef.color != obj.color) {
                            continue;
                        }
                        if (!anySize && objDef.size != obj.size) {
                            continue;
                        }

                        objIds.push(objId);
                    }
                }
            }

            return objIds;
        }

    }

    /**
     * Returns the stack column index (position of the stack in the world state),
     * given the object identifier.
     */
    export function getColumnIndex(objId: string, state: WorldState): number {
        for (var i = 0; i < state.stacks.length; i++) {
            for (var j = 0; j < state.stacks[i].length; j++) {
                if (objId == state.stacks[i][j]) {
                    return i;
                }
            }
        }

        return null;
    }

    /**
     * Returns the stack index (position in the stack),
     * given the object identifier and its stack column index.
     */
    export function getStackIndex(objId: string, i: number, state: WorldState): number {
        for (var j = 0; j < state.stacks[i].length; j++) {
            if (objId == state.stacks[i][j]) {
                return j;
            }
        }

        return null;
    }

    export function isLeftOf(objIds: string[], i: number, state: WorldState): boolean {
        if (i + 1 >= 0) {
            for (var k = 0; k < objIds.length; k++) {
                for (var n = i + 1; n < state.stacks.length; n++) {
                    for (var j = 0; j < state.stacks[n].length; j++) {
                        if (objIds[k] == state.stacks[n][j]) {
                            return true;
                        }
                    }
                }
            }
        }

        return false;
    }

    export function isRightOf(objIds: string[], i: number, state: WorldState): boolean {
        if (i >= 0) {
            for (var k = 0; k < objIds.length; k++) {
                for (var n = 0; n < i; n++) {
                    for (var j = 0; j < state.stacks[n].length; j++) {
                        if (objIds[k] == state.stacks[n][j]) {
                            return true;
                        }
                    }
                }
            }
        }

        return false;
    }

    /**
     * Helper function, returns true if any object identifiers
     * from the array is beside (left or right) the stack.
     *
     */
    export function isBeside(objIds: string[], i: number, state: WorldState): boolean {
        if (i - 1 >= 0) {
            for (var n = 0; n < objIds.length; n++) {
                for (var j = 0; j < state.stacks[i - 1].length; j++) {
                    if (objIds[n] == state.stacks[i - 1][j]) {
                        return true;
                    }
                }
            }
        }

        if (i + 1 >= 0) {
            for (var n = 0; n < objIds.length; n++) {
                for (var j = 0; j < state.stacks[i + 1].length; j++) {
                    if (objIds[n] == state.stacks[i + 1][j]) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    /**
     * Helper function, returns true if any object identifiers
     * from the array is directly under it in the same stack,
     * and only if it is a box.
     */
    export function isInside(objIds: string[], i: number, j: number, state: WorldState): boolean {
        // Objects can not be inside floor
        if (objIds[0] == "floor") {
            return false;
        }

        if (i >= 0 && j >= 0) {
            for (var n = 0; n < objIds.length; n++) {
                if (state.objects[objIds[n]].form != "box") {
                    // Objects can only be inside boxes
                    continue;
                } else if (objIds[n] == state.stacks[i][j]) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Helper function, returns true if any object identifiers
     * from the array is directly under it in the same stack.
     * Does not work for boxes or balls (according to the physical laws).
     */
    export function isOnTop(objIds: string[], i: number, j: number, state: WorldState): boolean {
        // If ontop of floor is being checked, then it has to be at the bottom of the stack
        if (objIds[0] == "floor") {
            if (j < 0) {
                return true;
            } else {
                return false;
            }

        }

        if (i >= 0 && j >= 0) {
            for (var n = 0; n < objIds.length; n++) {
                if (state.objects[objIds[n]].form == "box" || state.objects[objIds[n]].form == "ball") {
                    // Objects can not be supported by balls or be ontop of boxes
                    continue;
                } else if (objIds[n] == state.stacks[i][j]) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Helper function, returns true if any object identifiers
     * from the array is somewhere under the "commanded" object in the stack.
     */
    export function isAbove(objIds: string[], i: number, j: number, state: WorldState): boolean {
        // Every object is above the floor (except the floor itself)
        if (objIds[0] == "floor") {
            return true;
        }

        for (var n = 0; n < objIds.length; n++) {
            for (var k = 0; k < j; k++) {
                if (objIds[n] == state.stacks[i][k]) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Helper function, returns true if any object identifiers
     * from the array is somewhere above the "commanded" object in the stack.
     */
    export function isUnder(objIds: string[], i: number, j: number, state: WorldState): boolean {
        // Object can not be under the floor
        if (objIds[0] == "floor") {
            return false;
        }

        for (var n = 0; n < objIds.length; n++) {
            for (var k = j; k < state.stacks[i].length; k++) {
                if (objIds[n] == state.stacks[i][k]) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Checks if the possible goal is valid, given two object identifiers and their relation.
     * Returns a boolean according to the physical laws given for the placement and movements of objects.
     */
    export function isValidGoal(relation: string, state: WorldState, aObj: string, bObj: string): boolean {
        // Can not be the same object (can not have relation to itself)
        if (aObj == bObj) {
            return false;
        }

        // Should not be able to move or put the floor somewhere
        if (aObj == "floor") {
            return false;
        }

        // Valid only if it is ontop or above the floor
        if (bObj == "floor") {
            if (relation == "ontop" || relation == "above") {
                return true;
            } else if (relation == "inside") {
                return false;
            }

        }

        var cmdObj: ObjectDefinition = state.objects[aObj];
        var locObj: ObjectDefinition = state.objects[bObj];

        switch (relation) {
            case "inside":
                if ((cmdObj.size == "large" && locObj.size == "small") ||
                    locObj.form != "box" ||
                    ((cmdObj.form == "pyramid" || cmdObj.form == "plank" || cmdObj.form == "box") &&
                        cmdObj.size == locObj.size)) {
                    return false;
                }
                break;
            case "ontop":
            case "above":
                if ((cmdObj.form == "ball" && !(locObj.form == "floor") && relation == "ontop") ||
                    locObj.form == "ball" ||
                    (cmdObj.size == "large" && locObj.size == "small") ||
                    (cmdObj.form == "box" && cmdObj.size == "small" &&
                        locObj.size == "small" && (locObj.form == "brick" || locObj.form == "pyramid")) ||
                    (cmdObj.form == "box" && cmdObj.size == "large" &&
                        locObj.form == "pyramid" && locObj.size == "large") ||
                    (relation == "ontop" && (locObj.form == "ball" || locObj.form == "box"))) {
                    return false;
                }
                break;
        }

        return true;
    }

}
