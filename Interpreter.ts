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
     */
    function interpretCommand(cmd: Parser.Command, state: WorldState): DNFFormula {

        /**
         * Function that returns an array of valid object identifiers,
         * given an entity. Takes relative clauses into account (if there are any).
         */
        function getValidObjectIds(entity: Parser.Entity): string[] {
            var objIds: string[] = [];
            var obj: Parser.Object = entity.object;
            var hasRelativeObj: boolean = false;
            var relativeObjLoc: Parser.Location = null;

            // Checks if object has relative clause
            if (obj.object != undefined) {
                relativeObjLoc = obj.location;
                obj = obj.object;
                hasRelativeObj = true;
            }

            // Return array with the only object id as element
            if (obj.form == "floor") {
                objIds.push(obj.form);
                return objIds;
            }

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

                    // Checks the spatial relations, if there's a relative clause
                    if (hasRelativeObj) {
                        var relatives: string[] = getValidObjectIds(relativeObjLoc.entity);
                        // Self-note: The "above" and "under" relation is not yet implemented, might want it for the final version?
                        switch (relativeObjLoc.relation) {
                            case "leftof":
                                if (!isXOf(relatives, i - 1)) {
                                    continue;
                                }
                                break;
                            case "rightof":
                                if (!isXOf(relatives, i + 1)) {
                                    continue;
                                }
                                break;
                            case "inside":
                                if (!isInsideOnTop(relatives, i, j - 1)) {
                                    continue;
                                }
                                break;
                            case "beside":
                                if (!(isXOf(relatives, i - 1) || isXOf(relatives, i + 1))) {
                                    continue;
                                }
                                break;
                            case "ontop":
                                if (!isInsideOnTop(relatives, i, j - 1)) {
                                    continue;
                                }
                                break;
                        }
                    }

                    objIds.push(objId);
                }
            }

            return objIds;
        }

        /**
         * Helper function, returns true if any object identifiers
         * from the array is X (left or right) of the stack.
         * 
         */
        function isXOf(objIds: string[], i: number): boolean {
            if (i >= 0) {
                for (var n = 0; n < objIds.length; n++) {
                    for (var j = 0; j < state.stacks[i].length; j++) {
                        if (objIds[n] == state.stacks[i][j]) {
                            return true;
                        }
                    }
                }
            }

            return false;
        }

        /**
         * Helper function, returns true if any object identifiers
         * from the array is directly under it in the same stack.
         */
        function isInsideOnTop(objIds: string[], i: number, j: number): boolean {
            // If ontop of floor is being checked, then it has to be at the bottom of the stack
            if (objIds[0] == "floor" && j < 0) {
                return true;
            }

            if (i >= 0 && j >= 0) {
                for (var n = 0; n < objIds.length; n++) {
                    if (objIds[n] == state.stacks[i][j]) {
                        return true;
                    }
                }
            }

            return false;
        }

        /**
         * Checks if the possible goal is valid, given two object identifiers and their relation.
         * Returns a boolean according to the physical laws given for the placement and movements of objects.
         * NOTE: Not all physical laws are being considered at the moment.
         */
        function isValidGoal(relation: string, aObj: string, bObj: string): boolean {
            // Can not be the same object (can not have relation to itself)
            if (aObj == bObj) {
                return false;
            }

            // Valid only if it is ontop or above the floor
            if (bObj == "floor" && (relation == "ontop" || relation == "above")) {
                return true;
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
                    if ((cmdObj.form == "ball" && !(locObj.form == "floor")) ||
                        locObj.form == "ball" ||
                        (cmdObj.size == "large" && locObj.size == "small")) {
                        return false;
                    }
                    break;
            }

            return true;
        }

        var cmdEntity: Parser.Entity = cmd.entity;
        var cmdLoc: Parser.Location = cmd.location;

        var cmdDefs: string[] = [];
        var locDefs: string[] = [];

        if (cmdEntity != null) {
            cmdDefs = getValidObjectIds(cmdEntity);
        }

        if (cmdLoc != null) {
            locDefs = getValidObjectIds(cmdLoc.entity);
        }

        var interpretation: DNFFormula = [];
        var relation: string;

        if (cmd.command == "take") {
            relation = "holding";
        } else if (cmd.command == "move" && cmdLoc != null) {
            relation = cmdLoc.relation;
        }

        // Construct the goal interpretations/literals given the relation and object identifiers
        if (relation == "holding") {
            for (var i = 0; i < cmdDefs.length; i++) {
                interpretation.push([{ polarity: true, relation: relation, args: [cmdDefs[i]] }]);
            }
        } else if (cmdLoc != null) {
            for (var i = 0; i < cmdDefs.length; i++) {
                for (var j = 0; j < locDefs.length; j++) {
                    if (isValidGoal(relation, cmdDefs[i], locDefs[j])) {
                        interpretation.push([{ polarity: true, relation: relation, args: [cmdDefs[i], locDefs[j]] }]);
                    }
                }

            }
        }

        // No valid interpretations was found
        if (interpretation.length == 0) {
            throw Error;
        }

        return interpretation;
    }

}