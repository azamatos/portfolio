// `calc` values: arithmetic over other values' names, numbers, + - * / and parentheses. Nothing else is allowed, so
// an expression can't run code. Plain TypeScript with no imports: the schema and phase 2's collector use it too.

type Node =
  | { type: "num"; value: number }
  | { type: "name"; name: string }
  | { type: "neg"; arg: Node }
  | { type: "op"; op: "+" | "-" | "*" | "/"; left: Node; right: Node };

const TOKEN = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z][A-Za-z0-9]*)|([-+*/()]))/y;

function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < expr.length) {
    if (/^\s*$/.test(expr.slice(TOKEN.lastIndex))) break;
    const at = TOKEN.lastIndex;
    const m = TOKEN.exec(expr);
    if (!m)
      throw new Error(`unexpected "${expr.slice(at).trim()[0]}" at ${at + 1}`);
    tokens.push(m[1] ?? m[2] ?? m[3]);
  }
  return tokens;
}

/** Parses an expression, or throws with what's wrong in it. */
export function parseExpr(expr: string): Node {
  const tokens = tokenize(expr);
  let i = 0;
  const peek = () => tokens[i];
  const take = () => tokens[i++];

  // expr := term (("+" | "-") term)* ; term := unary (("*" | "/") unary)* ; unary := "-" unary | atom
  const parseSum = (): Node => {
    let left = parseProduct();
    while (peek() === "+" || peek() === "-") {
      const op = take() as "+" | "-";
      left = { type: "op", op, left, right: parseProduct() };
    }
    return left;
  };
  const parseProduct = (): Node => {
    let left = parseUnary();
    while (peek() === "*" || peek() === "/") {
      const op = take() as "*" | "/";
      left = { type: "op", op, left, right: parseUnary() };
    }
    return left;
  };
  const parseUnary = (): Node => {
    if (peek() === "-") {
      take();
      return { type: "neg", arg: parseUnary() };
    }
    return parseAtom();
  };
  const parseAtom = (): Node => {
    const t = take();
    if (t === undefined) throw new Error("the expression ends too early");
    if (t === "(") {
      const inner = parseSum();
      if (take() !== ")") throw new Error('a "(" is never closed');
      return inner;
    }
    if (/^\d/.test(t)) return { type: "num", value: Number(t) };
    if (/^[A-Za-z]/.test(t)) return { type: "name", name: t };
    throw new Error(`unexpected "${t}"`);
  };

  const tree = parseSum();
  if (i < tokens.length) throw new Error(`unexpected "${tokens[i]}"`);
  return tree;
}

/** The value names an expression uses. */
export function exprNames(expr: string): string[] {
  const names = new Set<string>();
  const visit = (n: Node) => {
    if (n.type === "name") names.add(n.name);
    else if (n.type === "neg") visit(n.arg);
    else if (n.type === "op") {
      visit(n.left);
      visit(n.right);
    }
  };
  visit(parseExpr(expr));
  return [...names];
}

/** Evaluates an expression; `lookup` gives each name's number. */
export function evalExpr(
  expr: string,
  lookup: (name: string) => number,
): number {
  const run = (n: Node): number => {
    switch (n.type) {
      case "num":
        return n.value;
      case "name":
        return lookup(n.name);
      case "neg":
        return -run(n.arg);
      case "op": {
        const a = run(n.left);
        const b = run(n.right);
        if (n.op === "/" && b === 0) throw new Error("division by zero");
        return n.op === "+"
          ? a + b
          : n.op === "-"
            ? a - b
            : n.op === "*"
              ? a * b
              : a / b;
      }
    }
  };
  return run(parseExpr(expr));
}
