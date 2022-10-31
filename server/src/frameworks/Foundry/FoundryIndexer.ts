import path from "path";
import { WorkspaceFolder } from "vscode-languageserver-protocol";
import { decodeUriAndRemoveFilePrefix } from "../../utils";
import ProjectIndexer from "../base/ProjectIndexer";
import FoundryProject from "./FoundryProject";

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

        return new FoundryProject(this.serverState, basePath, configFile);
      })
    );
  }
}
