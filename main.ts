// tiny-stack-vm: stack interpreter for make.fun's tiny-stack-vm-01.
// Wrapping 32-bit math, bounded stacks, word memory, traps as exit codes.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Immediate length per opcode, -1 for a byte that is no instruction.
function imm(op: number): number {
  if (op === 1) return 1;
  if (op === 2) return 4;
  if (op >= 0x30 && op <= 0x33) return 2;
  if (op === 0x1f) return -1;
  if (op <= 7 || (op >= 0x10 && op <= 0x22) || op === 0x34) return 0;
  if (op === 0x40 || op === 0x41 || (op >= 0x50 && op <= 0x53)) return 0;
  return -1;
}
// Popped count per opcode.
function pops(op: number): number {
  if (op === 7) return 3;
  if (op === 5 || op === 6 || op === 0x41) return 2;
  if (op >= 0x10 && op <= 0x22 && op !== 0x17 && op !== 0x1b) return 2;
  if (op === 3 || op === 4 || op === 0x17 || op === 0x1b) return 1;
  if (op === 0x31 || op === 0x32 || op === 0x40) return 1;
  if (op === 0x50 || op === 0x51 || op === 0x53) return 1;
  return 0;
}
// Pushed count per opcode.
function pushes(op: number): number {
  if (op === 4) return 2;
  if (op === 6 || op === 7) return 3;
  if (op === 5) return 2;
  if (op === 1 || op === 2 || op === 0x40 || op === 0x52) return 1;
  if (op >= 0x10 && op <= 0x22) return 1;
  return 0;
}

function run(prog: Uint8Array, input: Uint8Array) {
  const st = new Int32Array(256);
  const cs = new Int32Array(64);
  const mem = new Int32Array(256);
  const buf = new Uint8Array(65536);
  let sp = 0, depth = 0, used = 0, cursor = 0, pc = 0, steps = 0;
  const done = (code: number) => ({ bytes: buf.slice(0, used), code });
  for (;;) {
    if (steps >= 1000000) return done(10);
    if (pc < 0 || pc >= prog.length) return done(9);
    const op = prog[pc];
    const im = imm(op);
    if (im < 0) return done(5);
    if (pc + im >= prog.length) return done(9);
    steps++;
    const nx = pc + 1 + im;
    if (sp < pops(op)) return done(2);
    if (sp - pops(op) + pushes(op) > 256) return done(3);
    pc = nx;
    if (op === 0) return done(0);
    if (op === 1) { st[sp++] = (prog[nx - 1] << 24) >> 24; continue; }
    if (op === 2) {
      st[sp++] = prog[nx - 4] | (prog[nx - 3] << 8) | (prog[nx - 2] << 16) | (prog[nx - 1] << 24);
      continue;
    }
    if (op === 3) { sp--; continue; }
    if (op === 4) { st[sp] = st[sp - 1]; sp++; continue; }
    if (op === 5) { const t = st[sp - 1]; st[sp - 1] = st[sp - 2]; st[sp - 2] = t; continue; }
    if (op === 6) { st[sp] = st[sp - 2]; sp++; continue; }
    if (op === 7) {
      const a0 = st[sp - 3];
      st[sp - 3] = st[sp - 2]; st[sp - 2] = st[sp - 1]; st[sp - 1] = a0;
      continue;
    }
    if (op === 0x17) { st[sp - 1] = -st[sp - 1] | 0; continue; }
    if (op === 0x1b) { st[sp - 1] = ~st[sp - 1]; continue; }
    if (op >= 0x10 && op <= 0x22) {
      const b = st[sp - 1], a = st[sp - 2];
      let r = 0;
      if (op === 0x10) r = (a + b) | 0;
      else if (op === 0x11) r = (a - b) | 0;
      else if (op === 0x12) r = Math.imul(a, b);
      else if (op === 0x13) { if (!b) return done(4); r = a === -2147483648 && b === -1 ? a : Math.trunc(a / b) | 0; }
      else if (op === 0x14) { if (!b) return done(4); r = b === -1 ? 0 : a % b | 0; }
      else if (op === 0x15) { if (!b) return done(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; }
      else if (op === 0x16) { if (!b) return done(4); r = (a >>> 0) % (b >>> 0) | 0; }
      else if (op === 0x18) r = a & b;
      else if (op === 0x19) r = a | b;
      else if (op === 0x1a) r = a ^ b;
      else if (op === 0x1c) r = a << (b & 31);
      else if (op === 0x1d) r = a >> (b & 31);
      else if (op === 0x1e) r = (a >>> (b & 31)) | 0;
      else if (op === 0x20) r = a === b ? 1 : 0;
      else if (op === 0x21) r = a < b ? 1 : 0;
      else if (op === 0x22) r = (a >>> 0) < (b >>> 0) ? 1 : 0;
      st[--sp - 1] = r;
      continue;
    }
    if (op >= 0x30 && op <= 0x32) {
      const rel = ((prog[nx - 2] | (prog[nx - 1] << 8)) << 16) >> 16;
      let go = op === 0x30;
      if (op !== 0x30) { const v = st[--sp]; go = op === 0x31 ? v === 0 : v !== 0; }
      if (go) pc = nx + rel;
      continue;
    }
    if (op === 0x33) {
      if (depth >= 64) return done(7);
      cs[depth++] = nx;
      pc = prog[nx - 2] | (prog[nx - 1] << 8);
      continue;
    }
    if (op === 0x34) { if (!depth) return done(8); pc = cs[--depth]; continue; }
    if (op === 0x40) {
      const ad = st[sp - 1];
      if (ad < 0 || ad > 255) return done(6);
      st[sp - 1] = mem[ad];
      continue;
    }
    if (op === 0x41) {
      const ad = st[sp - 1], v = st[sp - 2];
      if (ad < 0 || ad > 255) return done(6);
      sp -= 2; mem[ad] = v;
      continue;
    }
    if (op === 0x50) {
      const s = String(st[sp - 1]);
      if (used + s.length > 65536) return done(11);
      sp--;
      for (let i = 0; i < s.length; i++) buf[used++] = s.charCodeAt(i);
      continue;
    }
    if (op === 0x51) { if (used >= 65536) return done(11); buf[used++] = st[--sp] & 255; continue; }
    if (op === 0x52) { st[sp++] = cursor < input.length ? input[cursor++] : -1; continue; }
    if (op === 0x53) return done(st[--sp] & 255);
    return done(5);
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const r = run(
    new Uint8Array(readFileSync(join(I, id, 'program.bin'))),
    new Uint8Array(readFileSync(join(I, id, 'input.bin'))),
  );
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.bytes);
  writeFileSync(join(O, id, 'exit.txt'), `${r.code}\n`);
}
