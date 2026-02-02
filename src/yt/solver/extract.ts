import { parse } from "meriyah";
import { getIO } from "./test/io.ts";
import { argv } from "node:process";
import { getSolutions, modifyPlayer } from "./solvers.ts";
import { generate } from "astring";

const io = await getIO();
const data = await io.read(argv[2]);
const program = parse(data);
const statements = modifyPlayer(program);
const solutionMap = getSolutions(statements);
for (const solutions of Object.values(solutionMap)) {
  for (const solution of solutions) {
    console.log(String.raw`${generate(solution)}`);
  }
}
