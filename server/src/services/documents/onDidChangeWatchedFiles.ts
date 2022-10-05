import { DidChangeWatchedFilesParams } from "vscode-languageserver";
import { ServerState } from "../../types";

export function onDidChangeWatchedFiles(serverState: ServerState) {
  return async (params: DidChangeWatchedFilesParams) => {
    for (const project of Object.values(serverState.projects)) {
      await project.onWatchedFilesChanges(params);
    }
  };
}
