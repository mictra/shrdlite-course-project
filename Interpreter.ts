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

        var objects: string[] = Array.prototype.concat.apply([], state.stacks);
        var objs: { [s: string]: ObjectDefinition } = state.objects;
        var objDefs: ObjectDefinition[] = [];
        // Retrieve the ObjectDefinition of the objects in the stacks 
        for (var i = 0; i < objects.length; i++) {
            objDefs.push(objs[objects[i]]);
        }

        // Identify different ObjectDefinitions command is referring to
        var scopeObjs: ObjectDefinition[] = [];

        // Objects the parser command is referring to
        var parserObjs: Parser.Object[] = [];
        var cmdEntity: Parser.Entity = cmd.entity;
        var cmdLoc: Parser.Location = cmd.location;

        if (cmdEntity != null) {
            var entityObj: Parser.Object = cmdEntity.object;
            if (entityObj.object != undefined) {
                // The relative location, might need to save it later?
                var relLoc: Parser.Location = entityObj.location;
                parserObjs.push(relLoc.entity.object);
                entityObj = entityObj.object;
            }
            parserObjs.push(entityObj);
        }

        if (cmdLoc != null) {
            var entityObj: Parser.Object = cmdLoc.entity.object;
            if (entityObj.object != undefined) {
                // The relative location, might need to save it later?
                var relLoc: Parser.Location = entityObj.location;
                parserObjs.push(relLoc.entity.object);
                entityObj = entityObj.object;
            }
            parserObjs.push(entityObj);
        }

        var anyForm: boolean = cmd.entity.object.form == "anyform";
        var anyColor: boolean = cmd.entity.object.color == null;
        var anySize: boolean = cmd.entity.object.size == null;

        for (var i = 0; i < objDefs.length; i++) {
            if (!anyForm) {
                if (cmd.entity.object.form == objDefs[i].form) {
                    scopeObjs.push(objDefs[i]);
                }
            } else {
                scopeObjs.push(objDefs[i]);
            }
        }
        for (var i = 0; i < scopeObjs.length; i++) {
            if (!anyColor) {
                if (!(cmd.entity.object.color == scopeObjs[i].color)) {
                    scopeObjs.splice(i, 1);
                    i--;
                }
            }
        }
        for (var i = 0; i < scopeObjs.length; i++) {
            if (!anySize) {
                if (!(cmd.entity.object.size == scopeObjs[i].size)) {
                    scopeObjs.splice(i, 1);
                    i--;
                }
            }
        }

        console.log("Command form: " + cmd.entity.object.form);
        console.log("Command size: " + cmd.entity.object.size);
        console.log("Command color: " + cmd.entity.object.color);
        console.log("FORM, SIZE, COLOR: " + anyForm + ", " + anySize + ", " + anyColor);
        console.log("Size of scope: " + scopeObjs.length);
        console.log("Size of parser objects: " + parserObjs.length);

        for (var i = 0; i < parserObjs.length; i++) {
            console.log("Form: " + scopeObjs[i].form);
        }



        var a: string = objects[Math.floor(Math.random() * objects.length)];
        var b: string = objects[Math.floor(Math.random() * objects.length)];
        var interpretation: DNFFormula = [[
            { polarity: true, relation: "ontop", args: [a, "floor"] },
            { polarity: true, relation: "holding", args: [b] }
        ]];
        return interpretation;
    }

}