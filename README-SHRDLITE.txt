Extensions in Planner.ts:
The AI is describing what it is doing while doing so. This is done by the function describeMove().
This function takes a command letter, a NodeState and a boolean indicating if it handles a take-action last and thus,
holding something in the end. The NodeState contains the necessary information about the world, e.g. if an object is
put on an empty stack, it is put on the ground.

In total, the files Graph.ts, Interpreter.ts and Planner.ts were changed due to small bugfixes and commentations.
