/* eslint-disable @typescript-eslint/no-unused-vars */
import * as vscode from "vscode";
import { spawn } from "child_process";
import { ExtensionState } from "../types";
import { getCurrentHardhatDir } from "../utils/workspace";

const COMMANDS = [
  {
    name: "compile",
  },
  {
    name: "test",
  },
  {
    name: "clean",
  },
  {
    name: "flatten",
  },
];

export function setupCommands(state: ExtensionState) {
  COMMANDS.forEach((command) => {
    const disposable = vscode.commands.registerCommand(
      `hardhat.solidity.${command.name}`,
      async () => {
        const currentHardhatDir = await getCurrentHardhatDir();

        if (currentHardhatDir === undefined) {
          return;
        }

        const outputChannel = getOutputChannel(state);
        outputChannel.show();
        outputChannel.appendLine(`Running 'npx hardhat ${command.name}'\n`);
        const childProcess = spawn("npx", ["hardhat", command.name], {
          cwd: currentHardhatDir,
        });

        childProcess.stdout.on("data", (data) => {
          outputChannel.append(data.toString());
        });
        childProcess.stderr.on("data", (data) => {
          outputChannel.append(data.toString());
        });
        childProcess.stdout.on("close", () => {
          outputChannel.appendLine("\nProcess exited\n");
        });
      }
    );
    state.context.subscriptions.push(disposable);
  });
}

const getOutputChannel = (state: ExtensionState) => {
  if (!state.commandsOutputChannel) {
    state.commandsOutputChannel =
      vscode.window.createOutputChannel("Hardhat Commands");
  }
  return state.commandsOutputChannel;
};
