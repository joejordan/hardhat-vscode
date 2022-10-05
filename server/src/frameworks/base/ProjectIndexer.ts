import { WorkspaceFolder } from "vscode-languageserver-protocol";
import { ServerState } from "../../types";
import { WorkspaceFileRetriever } from "../../utils/WorkspaceFileRetriever";
import Project from "./Project";

export default abstract class ProjectIndexer {
  constructor(
    public serverState: ServerState,
    public fileRetriever: WorkspaceFileRetriever
  ) {}

  public abstract index(folder: WorkspaceFolder): Promise<Project[]>;
}
