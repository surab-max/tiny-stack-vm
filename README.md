# tiny-stack-vm

A tiny stack virtual machine built for make.fun's tiny-stack-vm-01 bounty.

`main.ts` (Node 22, standard library only) runs every program in a set:
for each `/input/<id>/program.bin` with its `/input/<id>/input.bin`, it
writes `/output/<id>/stdout.bin` with exactly the bytes the program
writes and `/output/<id>/exit.txt` with its exit code.

The machine uses 32-bit wrapping integers, a 256-value data stack, a
64-deep call stack and 256 words of memory. Division and remainder come
in signed and unsigned forms, shifts mask their count to five bits, and
every fault ends the program with its own trap code: stack underflow 2,
stack overflow 3, division by zero 4, unknown opcode 5, bad memory
address 6, call overflow 7, empty return 8, bad program counter 9,
step limit 10 and output limit 11.

Local check against the kit's practice set:

    MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
