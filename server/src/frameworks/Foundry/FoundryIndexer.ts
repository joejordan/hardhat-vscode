import path from "path";
import { WorkspaceFolder } from "vscode-languageserver-protocol";
import { decodeUriAndRemoveFilePrefix } from "../../utils";
import { WorkspaceFileRetriever } from "../../utils/WorkspaceFileRetriever";
import ProjectIndexer from "../base/ProjectIndexer";
import FoundryProject from "./FoundryProject";
import { Remapping } from "./Remapping";

export default class FoundryIndexer extends ProjectIndexer {
  public async index(folder: WorkspaceFolder) {
    const uri = decodeUriAndRemoveFilePrefix(folder.uri);
    const configFiles = await this.fileRetriever.findFiles(
      uri,
      "**/foundry.toml",
      ["**/lib/**"]
    );

    return Promise.all(
      configFiles.map(async (configFile) => {
        const basePath = path.dirname(configFile);
        const remappings = await this._loadAndParseRemappings(
          basePath,
          this.fileRetriever
        );

        return new FoundryProject(
          this.serverState,
          basePath,
          configFile,
          remappings
        );
      })
    );
  }

  private async _loadAndParseRemappings(
    basePath: string,
    fileRetriever: WorkspaceFileRetriever
  ): Promise<Remapping[]> {
    const remappingsPath = path.join(basePath, "remappings.txt");
    if (await fileRetriever.fileExists(remappingsPath)) {
      const rawRemappings = await fileRetriever.readFile(remappingsPath);
      return this._parseRemappings(rawRemappings, basePath);
    }

    return [];
  }

  private _parseRemappings(rawRemappings: string, basePath: string) {
    const lines = rawRemappings.trim().split("\n");
    const remappings: Remapping[] = [];

    for (const line of lines) {
      const lineTokens = line.split("=", 2);

      if (
        lineTokens.length !== 2 ||
        lineTokens[0].length === 0 ||
        lineTokens[1].length === 0
      ) {
        continue;
      }

      const [from, to] = lineTokens.map((token) =>
        token.endsWith("/") ? token : `${token}/`
      );

      remappings.push({ from, to: path.join(basePath, to) });
    }

    return remappings;
  }
}
