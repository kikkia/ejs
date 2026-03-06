import { type ESTree, parse } from "meriyah";
import { generate } from "astring";
import { extract as extractSig } from "./sig.ts";
import { extract as extractN } from "./n.ts";
import { setupNodes } from "./setup.ts";

export function preprocessPlayer(data: string): string {
  const program = parse(data);
  const plainStatements = modifyPlayer(program);
  const solutions = getSolutions(plainStatements);
  for (const [name, options] of Object.entries(solutions)) {
    // TODO: this is cringe fix plz
    const unique = new Map(options.map((x) => [JSON.stringify(x), x]));
    if (unique.size === 0) {
      throw `found 0 ${name} function possibilities`;
    }
    plainStatements.push({
      type: "ExpressionStatement",
      expression: {
        type: "AssignmentExpression",
        operator: "=",
        left: {
          type: "MemberExpression",
          computed: false,
          object: {
            type: "Identifier",
            name: "_result",
          },
          property: {
            type: "Identifier",
            name: name,
          },
          optional: false,
        },
        right: multiTry([...unique.values()]),
      },
    });
  }

  program.body.splice(0, 0, ...setupNodes);
  return generate(program);
}

export function modifyPlayer(program: ESTree.Program) {
  const body = program.body;

  const block: ESTree.BlockStatement = (() => {
    switch (body.length) {
      case 1: {
        const func = body[0];
        if (
          func?.type === "ExpressionStatement" &&
          func.expression.type === "CallExpression" &&
          func.expression.callee.type === "MemberExpression" &&
          func.expression.callee.object.type === "FunctionExpression"
        ) {
          return func.expression.callee.object.body;
        }
        break;
      }
      case 2: {
        const func = body[1];
        if (
          func?.type === "ExpressionStatement" &&
          func.expression.type === "CallExpression" &&
          func.expression.callee.type === "FunctionExpression"
        ) {
          const block = func.expression.callee.body;
          // Skip `var window = this;`
          block.body.splice(0, 1);
          return block;
        }
        break;
      }
    }
    throw "unexpected structure";
  })();

  block.body = block.body.filter((node: ESTree.Statement) => {
    if (node.type === "ExpressionStatement") {
      if (node.expression.type === "AssignmentExpression") {
        return true;
      }
      return node.expression.type === "Literal";
    }
    return true;
  });

  return block.body;
}

export function getSolutions(
  statements: ESTree.Statement[],
): Record<string, ESTree.ArrowFunctionExpression[]> {
  const found = {
    n: [] as ESTree.ArrowFunctionExpression[],
    sig: [] as ESTree.ArrowFunctionExpression[],
  };
  for (const statement of statements) {
    const n = extractN(statement);
    if (n) {
      found.n.push(n);
    }
    const sig = extractSig(statement);
    if (sig) {
      found.sig.push(sig);
    }
  }
  // Single-script recovery fallback:
  // derive one high-confidence candidate from full-statement role behavior.
  if (found.n.length === 0) {
    const nFallback = extractNFromRole(statements);
    if (nFallback) {
      found.n.push(nFallback);
    }
  }
  if (found.n.length === 0 || found.n.every(isIdentitySolver)) {
    const nGeneric = extractNGenericTransform(statements);
    if (nGeneric) {
      found.n.push(nGeneric);
    }
  }
  if (found.sig.length === 0) {
    const sigFallback = extractSigFromRole(statements);
    if (sigFallback) {
      found.sig.push(sigFallback);
    }
  }
  return found;
}

export function getFromPrepared(code: string): {
  n: ((val: string) => string) | null;
  sig: ((val: string) => string) | null;
} {
  const resultObj = { n: null, sig: null };
  Function("_result", code)(resultObj);
  return resultObj;
}

function multiTry(
  generators: ESTree.ArrowFunctionExpression[],
): ESTree.ArrowFunctionExpression {
  return {
    type: "ArrowFunctionExpression",
    params: [
      {
        type: "Identifier",
        name: "_sig",
      },
    ],
    body: {
      type: "BlockStatement",
      body: [
        {
          type: "VariableDeclaration",
          kind: "const",
          declarations: [
            {
              type: "VariableDeclarator",
              id: {
                type: "Identifier",
                name: "_results",
              },
              init: {
                type: "NewExpression",
                callee: {
                  type: "Identifier",
                  name: "Set",
                },
                arguments: [],
              },
            },
          ],
        },
        {
          type: "ForOfStatement",
          left: {
            type: "VariableDeclaration",
            kind: "const",
            declarations: [
              {
                type: "VariableDeclarator",
                id: {
                  type: "Identifier",
                  name: "_generator",
                },
                init: null,
              },
            ],
          },
          right: {
            type: "ArrayExpression",
            elements: generators,
          },
          body: {
            type: "BlockStatement",
            body: [
              {
                type: "TryStatement",
                block: {
                  type: "BlockStatement",
                  body: [
                    {
                      type: "VariableDeclaration",
                      kind: "const",
                      declarations: [
                        {
                          type: "VariableDeclarator",
                          id: {
                            type: "Identifier",
                            name: "_value",
                          },
                          init: {
                            type: "CallExpression",
                            callee: {
                              type: "Identifier",
                              name: "_generator",
                            },
                            arguments: [
                              {
                                type: "Identifier",
                                name: "_sig",
                              },
                            ],
                            optional: false,
                          },
                        },
                      ],
                    },
                    {
                      type: "IfStatement",
                      test: {
                        type: "BinaryExpression",
                        left: {
                          type: "Identifier",
                          name: "_value",
                        },
                        right: {
                          type: "Identifier",
                          name: "_sig",
                        },
                        operator: "===",
                      },
                      consequent: {
                        type: "BlockStatement",
                        body: [
                          {
                            type: "ContinueStatement",
                            label: null,
                          },
                        ],
                      },
                      alternate: null,
                    },
                    {
                      type: "ExpressionStatement",
                      expression: {
                        type: "CallExpression",
                        callee: {
                          type: "MemberExpression",
                          object: {
                            type: "Identifier",
                            name: "_results",
                          },
                          computed: false,
                          property: {
                            type: "Identifier",
                            name: "add",
                          },
                          optional: false,
                        },
                        arguments: [
                          {
                            type: "Identifier",
                            name: "_value",
                          },
                        ],
                        optional: false,
                      },
                    },
                  ],
                },
                handler: {
                  type: "CatchClause",
                  param: null,
                  body: {
                    type: "BlockStatement",
                    body: [],
                  },
                },
                finalizer: null,
              },
            ],
          },
          await: false,
        },
        {
          type: "IfStatement",
          test: {
            type: "BinaryExpression",
            left: {
              type: "MemberExpression",
              object: {
                type: "Identifier",
                name: "_results",
              },
              computed: false,
              property: {
                type: "Identifier",
                name: "size",
              },
              optional: false,
            },
            right: {
              type: "Literal",
              value: 1,
            },
            operator: "!==",
          },
          consequent: {
            type: "BlockStatement",
            body: [
              {
                type: "ThrowStatement",
                argument: {
                  type: "TemplateLiteral",
                  expressions: [
                    {
                      type: "CallExpression",
                      callee: {
                        type: "MemberExpression",
                        object: {
                          type: "CallExpression",
                          callee: {
                            type: "MemberExpression",
                            object: {
                              type: "Identifier",
                              name: "Array",
                            },
                            computed: false,
                            property: {
                              type: "Identifier",
                              name: "from",
                            },
                            optional: false,
                          },
                          arguments: [
                            {
                              type: "Identifier",
                              name: "_results",
                            },
                          ],
                          optional: false,
                        },
                        computed: false,
                        property: {
                          type: "Identifier",
                          name: "join",
                        },
                        optional: false,
                      },
                      arguments: [
                        {
                          type: "Literal",
                          value: ", ",
                        },
                      ],
                      optional: false,
                    },
                  ],
                  quasis: [
                    {
                      type: "TemplateElement",
                      value: {
                        cooked: "invalid solutions: ",
                        raw: "invalid solutions: ",
                      },
                      tail: false,
                    },
                    {
                      type: "TemplateElement",
                      value: {
                        cooked: "",
                        raw: "",
                      },
                      tail: true,
                    },
                  ],
                },
              },
            ],
          },
          alternate: null,
        },

        {
          type: "ReturnStatement",
          argument: {
            type: "MemberExpression",
            object: {
              type: "CallExpression",
              callee: {
                type: "MemberExpression",
                object: {
                  type: "CallExpression",
                  callee: {
                    type: "MemberExpression",
                    object: {
                      type: "Identifier",
                      name: "_results",
                    },
                    computed: false,
                    property: {
                      type: "Identifier",
                      name: "values",
                    },
                    optional: false,
                  },
                  arguments: [],
                  optional: false,
                },
                computed: false,
                property: {
                  type: "Identifier",
                  name: "next",
                },
                optional: false,
              },
              arguments: [],
              optional: false,
            },
            computed: false,
            property: {
              type: "Identifier",
              name: "value",
            },
            optional: false,
          },
        },
      ],
    },
    async: false,
    expression: false,
    generator: false,
  };
}

type NamedFunction = {
  name: string;
  fn: ESTree.FunctionDeclaration | ESTree.FunctionExpression | ESTree.ArrowFunctionExpression;
};

function collectNamedFunctions(statements: ESTree.Statement[]): NamedFunction[] {
  const out: NamedFunction[] = [];
  for (const s of statements) {
    if (s.type === "FunctionDeclaration" && s.id?.name) {
      out.push({ name: s.id.name, fn: s });
      continue;
    }
    if (
      s.type === "ExpressionStatement" &&
      s.expression.type === "AssignmentExpression" &&
      s.expression.left.type === "Identifier" &&
      (s.expression.right.type === "FunctionExpression" ||
        s.expression.right.type === "ArrowFunctionExpression")
    ) {
      out.push({ name: s.expression.left.name, fn: s.expression.right });
      continue;
    }
    if (s.type === "VariableDeclaration") {
      for (const d of s.declarations) {
        if (
          d.id.type === "Identifier" &&
          (d.init?.type === "FunctionExpression" ||
            d.init?.type === "ArrowFunctionExpression")
        ) {
          out.push({ name: d.id.name, fn: d.init });
        }
      }
    }
  }
  return out;
}

function extractNFromRole(
  statements: ESTree.Statement[],
): ESTree.ArrowFunctionExpression | null {
  const named = collectNamedFunctions(statements);
  let best:
    | {
        score: number;
        fn: NamedFunction;
      }
    | null = null;

  for (const entry of named) {
    const body = entry.fn.body;
    if (body.type !== "BlockStatement") continue;
    let hasGetN = false;
    let hasNPath = false;
    walk(body, (n) => {
      if (
        n.type === "CallExpression" &&
        n.callee.type === "MemberExpression" &&
        n.callee.property.type === "Identifier" &&
        n.callee.property.name === "get" &&
        n.arguments[0]?.type === "Literal" &&
        n.arguments[0].value === "n"
      ) {
        hasGetN = true;
      }
      if (n.type === "Literal" && typeof n.value === "string" && n.value.includes("/n/")) {
        hasNPath = true;
      }
      if (n.type === "Literal") {
        const rx = (n as unknown as { regex?: { pattern?: string } }).regex;
        if (rx?.pattern?.includes("\\/n\\/")) hasNPath = true;
      }
    });
    if (!hasGetN || !hasNPath) continue;
    const score = (hasGetN ? 2 : 0) + (hasNPath ? 2 : 0);
    if (!best || score > best.score) {
      best = { score, fn: entry };
    }
  }

  if (!best) return null;
  const rewriterName = best.fn.name;
  const body = best.fn.fn.body;
  if (body.type !== "BlockStatement") return null;

  const nVars = new Set<string>();
  let transform: string | null = null;
  walk(body, (n, parent) => {
    if (
      n.type === "CallExpression" &&
      n.callee.type === "MemberExpression" &&
      n.callee.property.type === "Identifier" &&
      n.callee.property.name === "get" &&
      n.arguments[0]?.type === "Literal" &&
      n.arguments[0].value === "n"
    ) {
      if (parent?.type === "VariableDeclarator" && parent.id.type === "Identifier") {
        nVars.add(parent.id.name);
      } else if (
        parent?.type === "AssignmentExpression" &&
        parent.left.type === "Identifier"
      ) {
        nVars.add(parent.left.name);
      }
      return;
    }
    if (
      transform === null &&
      n.type === "CallExpression" &&
      n.callee.type === "Identifier" &&
      n.arguments.some((arg) => arg.type === "Identifier" && nVars.has(arg.name))
    ) {
      transform = n.callee.name;
    }
  });

  if (transform) {
    return {
      type: "ArrowFunctionExpression",
      params: [{ type: "Identifier", name: "n" }],
      body: {
        type: "CallExpression",
        callee: { type: "Identifier", name: transform },
        arguments: [{ type: "Identifier", name: "n" }],
        optional: false,
      },
      async: false,
      expression: false,
      generator: false,
    };
  }

  // Fallback: use n URL rewriter function directly and re-extract /n/<value>.
  // This is what runtime probe validated for 6c5cb4f4 (FBF).
  return {
    type: "ArrowFunctionExpression",
    params: [{ type: "Identifier", name: "n" }],
    body: {
      type: "CallExpression",
      callee: {
        type: "ArrowFunctionExpression",
        params: [{ type: "Identifier", name: "_n" }],
        body: {
          type: "BlockStatement",
          body: [
            {
              type: "VariableDeclaration",
              kind: "const",
              declarations: [
                {
                  type: "VariableDeclarator",
                  id: { type: "Identifier", name: "_u" },
                  init: {
                    type: "CallExpression",
                    callee: { type: "Identifier", name: rewriterName },
                    arguments: [
                      {
                        type: "BinaryExpression",
                        operator: "+",
                        left: {
                          type: "Literal",
                          value: "https://a1.googlevideo.com/videoplayback/n/OLDSEG?n=",
                        },
                        right: { type: "Identifier", name: "_n" },
                      },
                    ],
                    optional: false,
                  },
                },
              ],
            },
            {
              type: "VariableDeclaration",
              kind: "const",
              declarations: [
                {
                  type: "VariableDeclarator",
                  id: { type: "Identifier", name: "_m" },
                  init: {
                    type: "CallExpression",
                    callee: {
                      type: "MemberExpression",
                      object: { type: "Identifier", name: "_u" },
                      computed: false,
                      property: { type: "Identifier", name: "match" },
                      optional: false,
                    },
                    arguments: [
                      {
                        type: "Literal",
                        regex: { pattern: "\\/n\\/([^/?&]+)", flags: "" },
                        value: /\/n\/([^/?&]+)/,
                      } as ESTree.Literal,
                    ],
                    optional: false,
                  },
                },
              ],
            },
            {
              type: "ReturnStatement",
              argument: {
                type: "LogicalExpression",
                operator: "||",
                left: {
                  type: "LogicalExpression",
                  operator: "&&",
                  left: { type: "Identifier", name: "_m" },
                  right: {
                    type: "MemberExpression",
                    object: { type: "Identifier", name: "_m" },
                    computed: true,
                    property: { type: "Literal", value: 1 },
                    optional: false,
                  },
                },
                right: { type: "Identifier", name: "_n" },
              },
            },
          ],
        },
        async: false,
        expression: false,
        generator: false,
      },
      arguments: [{ type: "Identifier", name: "n" }],
      optional: false,
    },
    async: false,
    expression: false,
    generator: false,
  };
}

function extractSigFromRole(
  statements: ESTree.Statement[],
): ESTree.ArrowFunctionExpression | null {
  const named = collectNamedFunctions(statements);
  let best:
    | {
        score: number;
        fn: NamedFunction;
      }
    | null = null;

  for (const entry of named) {
    const body = entry.fn.body;
    if (body.type !== "BlockStatement") continue;
    let hasSet = false;
    let hasAlrYes = false;
    walk(body, (n) => {
      if (
        n.type === "CallExpression" &&
        n.callee.type === "MemberExpression" &&
        n.callee.property.type === "Identifier" &&
        n.callee.property.name === "set"
      ) {
        hasSet = true;
        if (
          n.arguments[0]?.type === "Literal" &&
          n.arguments[0].value === "alr" &&
          n.arguments[1]?.type === "Literal" &&
          n.arguments[1].value === "yes"
        ) {
          hasAlrYes = true;
        }
      }
    });
    if (!hasSet) continue;
    const score = (hasSet ? 1 : 0) + (hasAlrYes ? 3 : 0);
    if (!best || score > best.score) {
      best = { score, fn: entry };
    }
  }

  if (!best) return null;
  const fn = best.fn.fn;
  if (fn.body.type !== "BlockStatement") return null;

  const paramNames = fn.params
    .filter((p): p is ESTree.Identifier => p.type === "Identifier")
    .map((p) => p.name);
  if (paramNames.length === 0) return null;

  let solverExpr: ESTree.Expression | null = null;
  let sourceParam: string | null = null;

  walk(fn.body, (n) => {
    if (solverExpr !== null) return;
    if (
      n.type !== "CallExpression" ||
      n.callee.type !== "MemberExpression" ||
      n.callee.property.type !== "Identifier" ||
      n.callee.property.name !== "set" ||
      n.arguments.length < 2
    ) {
      return;
    }
    const valueExpr = n.arguments[1];
    const used = new Set<string>();
    walk(valueExpr, (inner) => {
      if (inner.type === "Identifier") used.add(inner.name);
    });
    const chosen = paramNames.find((name) => used.has(name));
    if (!chosen) return;
    solverExpr = replaceIdentifier(valueExpr, chosen, {
      type: "Identifier",
      name: "sig",
    });
    sourceParam = chosen;
  });

  if (solverExpr === null) {
    // Newer obfuscation may use computed method calls instead of `.set(...)`.
    // Example: urlObj[v[idx]](spParam, transformedSigExpr)
    walk(fn.body, (n) => {
      if (solverExpr !== null || n.type !== "CallExpression" || n.arguments.length < 2) {
        return;
      }
      const firstArg = n.arguments[0];
      const secondArg = n.arguments[1];
      if (secondArg.type === "Literal") return;

      const usedFirst = new Set<string>();
      const usedSecond = new Set<string>();
      walk(firstArg, (inner) => {
        if (inner.type === "Identifier") usedFirst.add(inner.name);
      });
      walk(secondArg, (inner) => {
        if (inner.type === "Identifier") usedSecond.add(inner.name);
      });

      const firstParam = paramNames.find((name) => usedFirst.has(name));
      const secondParam = paramNames.find((name) => usedSecond.has(name));
      if (!firstParam || !secondParam || firstParam === secondParam) return;

      solverExpr = replaceIdentifier(secondArg, secondParam, {
        type: "Identifier",
        name: "sig",
      });
      sourceParam = secondParam;
    });
  }

  if (!solverExpr || !sourceParam) return null;

  const assignmentTransform = findAssignmentTransform(fn.body, sourceParam);
  if (
    assignmentTransform &&
    scoreTransformExpr(assignmentTransform) > scoreTransformExpr(solverExpr)
  ) {
    solverExpr = replaceIdentifier(assignmentTransform, sourceParam, {
      type: "Identifier",
      name: "sig",
    });
  }

  return {
    type: "ArrowFunctionExpression",
    params: [{ type: "Identifier", name: "sig" }],
    body: solverExpr,
    async: false,
    expression: true,
    generator: false,
  };
}

function extractNGenericTransform(
  statements: ESTree.Statement[],
): ESTree.ArrowFunctionExpression | null {
  const named = collectNamedFunctions(statements);
  let best: { name: string; score: number } | null = null;

  for (const entry of named) {
    if (entry.fn.params.length !== 1) continue;
    const p = entry.fn.params[0];
    if (p.type !== "Identifier") continue;
    if (entry.fn.body.type !== "BlockStatement") continue;

    const paramName = p.name;
    let score = 0;
    let hasReturnCall = false;
    let hasNUrlRoleHints = false;

    walk(entry.fn.body, (n) => {
      if (
        n.type === "CallExpression" &&
        n.callee.type === "MemberExpression" &&
        n.callee.property.type === "Identifier" &&
        n.callee.property.name === "get" &&
        n.arguments[0]?.type === "Literal" &&
        n.arguments[0].value === "n"
      ) {
        hasNUrlRoleHints = true;
      }
      if (n.type === "Literal" && typeof n.value === "string" && n.value.includes("/n/")) {
        hasNUrlRoleHints = true;
      }
      if (
        n.type === "ReturnStatement" &&
        n.argument?.type === "CallExpression" &&
        n.argument.callee.type === "Identifier" &&
        n.argument.arguments.some(
          (a) => a.type === "Identifier" && a.name === paramName,
        )
      ) {
        hasReturnCall = true;
        score += 2;
      }
      if (n.type === "CallExpression" && n.callee.type === "MemberExpression") {
        const prop = n.callee.property;
        if (prop.type === "Identifier") {
          if (["split", "join", "reverse", "slice", "splice"].includes(prop.name)) score += 1;
          if (["charCodeAt"].includes(prop.name)) score += 1;
        }
      }
      if (n.type === "CallExpression" && n.callee.type === "Identifier") {
        if (["fromCharCode"].includes(n.callee.name)) score += 1;
      }
    });

    if (hasNUrlRoleHints) continue;
    if (!hasReturnCall || score < 3) continue;
    if (!best || score > best.score) {
      best = { name: entry.name, score };
    }
  }

  if (!best) return null;
  return {
    type: "ArrowFunctionExpression",
    params: [{ type: "Identifier", name: "n" }],
    body: {
      type: "CallExpression",
      callee: { type: "Identifier", name: best.name },
      arguments: [{ type: "Identifier", name: "n" }],
      optional: false,
    },
    async: false,
    expression: false,
    generator: false,
  };
}

function findAssignmentTransform(
  body: ESTree.BlockStatement,
  sourceParam: string,
): ESTree.Expression | null {
  let best: { expr: ESTree.Expression; score: number } | null = null;
  walk(body, (n) => {
    if (
      n.type !== "AssignmentExpression" ||
      n.operator !== "=" ||
      n.left.type !== "Identifier" ||
      n.left.name !== sourceParam
    ) {
      return;
    }
    const refs = new Set<string>();
    walk(n.right, (inner) => {
      if (inner.type === "Identifier") refs.add(inner.name);
    });
    if (!refs.has(sourceParam)) return;
    const score = scoreTransformExpr(n.right);
    if (!best || score > best.score) {
      best = { expr: n.right, score };
    }
  });
  return best?.expr ?? null;
}

function scoreTransformExpr(expr: ESTree.Expression): number {
  let score = 0;
  walk(expr, (n) => {
    if (n.type === "CallExpression") score += 1;
    if (n.type === "BinaryExpression") score += 1;
    if (n.type === "CallExpression" && n.callee.type === "MemberExpression") {
      const prop = n.callee.property;
      if (
        prop.type === "Identifier" &&
        ["split", "join", "reverse", "slice", "splice", "charCodeAt"].includes(prop.name)
      ) {
        score += 2;
      }
    }
  });
  return score;
}

function isIdentitySolver(candidate: ESTree.ArrowFunctionExpression): boolean {
  return (
    candidate.params.length === 1 &&
    candidate.params[0].type === "Identifier" &&
    candidate.body.type === "Identifier" &&
    candidate.body.name === candidate.params[0].name
  );
}

function replaceIdentifier<T extends ESTree.Node>(
  node: T,
  name: string,
  replacement: ESTree.Identifier,
): T {
  const copy = JSON.parse(JSON.stringify(node)) as T;
  walk(copy, (n) => {
    if (n.type === "Identifier" && n.name === name) {
      n.name = replacement.name;
    }
  });
  return copy;
}

function walk(
  node: ESTree.Node,
  cb: (node: ESTree.Node, parent: ESTree.Node | null) => void,
  parent: ESTree.Node | null = null,
) {
  cb(node, parent);
  for (const value of Object.values(node as Record<string, unknown>)) {
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === "object" && "type" in child) {
          walk(child as ESTree.Node, cb, node);
        }
      }
      continue;
    }
    if (typeof value === "object" && "type" in value) {
      walk(value as ESTree.Node, cb, node);
    }
  }
}
