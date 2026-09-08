const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const ESC = String.fromCharCode(27);

function paint(code: string, text: string): string {
  return useColor ? `${ESC}[${code}m${text}${ESC}[0m` : text;
}

export const c = {
  dim: (t: string) => paint("2", t),
  bold: (t: string) => paint("1", t),
  green: (t: string) => paint("32", t),
  yellow: (t: string) => paint("33", t),
  red: (t: string) => paint("31", t),
  cyan: (t: string) => paint("36", t),
};

let verbose = false;
export function setVerbose(on: boolean): void {
  verbose = on;
}
export function isVerbose(): boolean {
  return verbose;
}

export const log = {
  info(msg: string): void {
    console.log(msg);
  },
  step(tool: string, msg: string): void {
    console.log(`${c.cyan(`[${tool}]`)} ${msg}`);
  },
  ok(tool: string, msg: string): void {
    console.log(`${c.cyan(`[${tool}]`)} ${c.green(msg)}`);
  },
  warn(tool: string | null, msg: string): void {
    const prefix = tool ? `${c.cyan(`[${tool}]`)} ` : "";
    console.log(`${prefix}${c.yellow(msg)}`);
  },
  error(tool: string | null, msg: string): void {
    const prefix = tool ? `${c.cyan(`[${tool}]`)} ` : "";
    console.error(`${prefix}${c.red(msg)}`);
  },
  debug(msg: string): void {
    if (verbose) console.log(c.dim(`  ${msg}`));
  },
  command(cmd: string): void {
    for (const line of cmd.trim().split(/\r?\n/)) console.log(c.dim(`  $ ${line}`));
  },
};
