import { type ESTree } from "meriyah";
import { matchesStructure } from "../../utils.ts";
import { type DeepPartial } from "../../types.ts";

const nsigExpression: DeepPartial<ESTree.Statement> = {
  type: "VariableDeclaration",
  kind: "var",
  declarations: [
    {
      type: "VariableDeclarator",
      init: {
        type: "CallExpression",
        callee: {
          type: "Identifier",
        },
        arguments: [
          { type: "Literal" },
          {
            type: "CallExpression",
            callee: {
              type: "Identifier",
              name: "decodeURIComponent",
            },
          },
        ],
      },
    },
  ],
};

const logicalExpression: DeepPartial<ESTree.ExpressionStatement> = {
  type: "ExpressionStatement",
  expression: {
    type: "LogicalExpression",
    left: {
      type: "Identifier",
    },
    right: {
      type: "SequenceExpression",
      expressions: [
        {
          type: "AssignmentExpression",
          left: {
            type: "Identifier",
          },
          operator: "=",
          right: {
            type: "CallExpression",
            callee: {
              type: "Identifier",
            },
            arguments: {
              or: [
                [
                  {
                    type: "CallExpression",
                    callee: {
                      type: "Identifier",
                      name: "decodeURIComponent",
                    },
                    arguments: [{ type: "Identifier" }],
                    optional: false,
                  },
                ],
                [
                  { type: "Literal" },
                  {
                    type: "CallExpression",
                    callee: {
                      type: "Identifier",
                      name: "decodeURIComponent",
                    },
                    arguments: [{ type: "Identifier" }],
                    optional: false,
                  },
                ],
                [
                  { type: "Literal" },
                  { type: "Literal" },
                  {
                    type: "CallExpression",
                    callee: {
                      type: "Identifier",
                      name: "decodeURIComponent",
                    },
                    arguments: [{ type: "Identifier" }],
                    optional: false,
                  },
                ],
              ],
            },
            optional: false,
          },
        },
        {
          type: "CallExpression",
        },
      ],
    },
    operator: "&&",
  },
};

const identifier: DeepPartial<ESTree.Node> = {
  or: [
    {
      type: "ExpressionStatement",
      expression: {
        type: "AssignmentExpression",
        operator: "=",
        left: {
          type: "Identifier",
        },
        right: {
          type: "FunctionExpression",
          params: [{}, {}, {}],
        },
      },
    },
    {
      type: "FunctionDeclaration",
      params: [{}, {}, {}],
    },
    {
      type: "VariableDeclaration",
      declarations: {
        anykey: [
          {
            type: "VariableDeclarator",
            init: {
              type: "FunctionExpression",
              params: [{}, {}, {}],
            },
          },
        ],
      },
    },
  ],
} as const;

export function extract(
  node: ESTree.Node,
): ESTree.ArrowFunctionExpression | null {
  // match: deep if
  if (
    matchesStructure(node, {
      type: "ExpressionStatement",
      expression: {
        type: "AssignmentExpression",
        operator: "=",
        left: {
          or: [{ type: "Identifier" }, { type: "MemberExpression" }],
        },
        right: {
          type: "FunctionExpression",
        },
      },
    })
  ) {
    // TODO
    if (
      node.type !== "ExpressionStatement" ||
      node.expression.type !== "AssignmentExpression" ||
      node.expression.right.type !== "FunctionExpression"
    ) {
      return null;
    }
    for (const statement of node.expression.right.body!.body) {
      if (
        statement.type !== "IfStatement" ||
        statement.consequent.type !== "BlockStatement"
      ) {
        continue;
      }
      for (const statement2 of statement.consequent.body) {
        if (statement2.type !== "VariableDeclaration") {
          continue;
        }
        for (const declaration of statement2.declarations) {
          if (declaration.init?.type !== "CallExpression") {
            continue;
          }
          for (const arg of declaration.init.arguments) {
            if (
              arg.type !== "CallExpression" ||
              arg.callee.type !== "Identifier" ||
              arg.callee.name !== "decodeURIComponent"
            ) {
              continue;
            }
            return {
              type: "ArrowFunctionExpression",
              params: [
                {
                  type: "Identifier",
                  name: "sig",
                },
              ],
              body: processSigCallExpression(declaration.init),
              async: false,
              expression: false,
              generator: false,
            };
          }
        }
      }
    }
  }
  if (!matchesStructure(node, identifier)) {
    return extractFromSigRole(node);
  }
  let block: ESTree.BlockStatement | undefined | null;
  if (
    node.type === "ExpressionStatement" &&
    node.expression.type === "AssignmentExpression" &&
    node.expression.right.type === "FunctionExpression"
  ) {
    block = node.expression.right.body;
  } else if (node.type === "VariableDeclaration") {
    for (const decl of node.declarations) {
      if (
        decl.type === "VariableDeclarator" &&
        decl.init?.type === "FunctionExpression" &&
        decl.init?.params.length === 3
      ) {
        block = decl.init.body;
        break;
      }
    }
  } else if (node.type === "FunctionDeclaration") {
    block = node.body;
  } else {
    return null;
  }
  const relevantExpression = block?.body.at(-2);

  let call: ESTree.CallExpression | null = null;
  if (matchesStructure(relevantExpression!, logicalExpression)) {
    if (
      relevantExpression?.type !== "ExpressionStatement" ||
      relevantExpression.expression.type !== "LogicalExpression" ||
      relevantExpression.expression.right.type !== "SequenceExpression" ||
      relevantExpression.expression.right.expressions[0].type !==
        "AssignmentExpression" ||
      relevantExpression.expression.right.expressions[0].right.type !==
        "CallExpression"
    ) {
      return null;
    }
    call = relevantExpression.expression.right.expressions[0].right;
  } else if (
    relevantExpression?.type === "IfStatement" &&
    relevantExpression.consequent.type === "BlockStatement"
  ) {
    for (const n of relevantExpression.consequent.body) {
      if (!matchesStructure(n, nsigExpression)) {
        continue;
      }
      if (
        n.type !== "VariableDeclaration" ||
        n.declarations[0].init?.type !== "CallExpression"
      ) {
        continue;
      }
      call = n.declarations[0].init;
      break;
    }
  }
  if (call === null) {
    const fromRoleFallback = extractFromSigRole(node);
    if (fromRoleFallback) {
      return fromRoleFallback;
    }
    return null;
  }
  // TODO: verify identifiers here
  return {
    type: "ArrowFunctionExpression",
    params: [
      {
        type: "Identifier",
        name: "sig",
      },
    ],
    body: processSigCallExpression(call),
    async: false,
    expression: false,
    generator: false,
  };
}

function processSigCallExpression(
  call: ESTree.CallExpression,
): ESTree.CallExpression {
  return {
    type: "CallExpression",
    callee: call.callee,
    arguments: call.arguments.map((arg) =>
      matchesStructure(arg, {
        type: "CallExpression",
        callee: {
          type: "Identifier",
          name: "decodeURIComponent",
        },
        optional: false,
      })
        ? ({
            type: "Identifier",
            name: "sig",
          } satisfies ESTree.Expression)
        : arg,
    ),
    optional: false,
  };
}

function extractFromSigRole(node: ESTree.Node): ESTree.ArrowFunctionExpression | null {
  const block = getFunctionBlock(node);
  if (!block) return null;

  let hasSigHint = false;
  let hasSetCall = false;
  let hasDecode = false;
  let transformCall: ESTree.CallExpression | null = null;

  walk(block, (n) => {
    if (n.type === "Literal" && typeof n.value === "string") {
      if (n.value === "signatureCipher" || n.value === "s" || n.value === "sp") {
        hasSigHint = true;
      }
      return;
    }
    if (n.type !== "CallExpression") return;

    if (
      n.callee.type === "MemberExpression" &&
      n.callee.property.type === "Identifier" &&
      n.callee.property.name === "set"
    ) {
      hasSetCall = true;
    }

    if (
      n.callee.type === "Identifier" &&
      n.callee.name !== "decodeURIComponent" &&
      n.arguments.some(
        (arg) =>
          arg.type === "CallExpression" &&
          arg.callee.type === "Identifier" &&
          arg.callee.name === "decodeURIComponent",
      )
    ) {
      hasDecode = true;
      if (!transformCall) {
        transformCall = n;
      }
    }
  });

  if (!hasSigHint || !hasSetCall || !hasDecode || !transformCall) {
    return null;
  }

  return {
    type: "ArrowFunctionExpression",
    params: [
      {
        type: "Identifier",
        name: "sig",
      },
    ],
    body: processSigCallExpression(transformCall),
    async: false,
    expression: false,
    generator: false,
  };
}

function getFunctionBlock(node: ESTree.Node): ESTree.BlockStatement | null {
  if (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  ) {
    return node.body.type === "BlockStatement" ? node.body : null;
  }
  if (
    node.type === "ExpressionStatement" &&
    node.expression.type === "AssignmentExpression" &&
    (node.expression.right.type === "FunctionExpression" ||
      node.expression.right.type === "ArrowFunctionExpression")
  ) {
    return node.expression.right.body.type === "BlockStatement"
      ? node.expression.right.body
      : null;
  }
  if (node.type === "VariableDeclaration") {
    for (const declaration of node.declarations) {
      if (
        declaration.init?.type === "FunctionExpression" ||
        declaration.init?.type === "ArrowFunctionExpression"
      ) {
        return declaration.init.body.type === "BlockStatement"
          ? declaration.init.body
          : null;
      }
    }
  }
  return null;
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
